#!/usr/bin/env python3
"""
generate_data.py — feather 学習用データ生成

人間データ(アノテーション)の品質オペレーションを模した、現実的なデータセットを作る。
Mercor の Quality PM が実際に向き合う構造を再現:
  - アノテーターごとに「スキル」と「作業速度バイアス」という隠れた性質がある
  - 速く雑にやる人 (rusher) は品質が落ちやすい  ← 分析で炙り出すべき "root cause"
  - レビュー(audit)で品質スコアと判定(approve/minor_fix/reject)がつく
  - エラー種別はアノテーターの弱点に依存する

出力:
  quality.db           SQLite データベース(SQL練習用)
  csv/*.csv            各テーブルの CSV(pandas練習用)
  schema.sql           テーブル定義(参照用)

決定論的(seed固定)なので、誰が実行しても同じデータ・同じ答えになる。
"""
import sqlite3, os, csv, random, math, datetime as dt

random.seed(42)
HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "quality.db")
CSV_DIR = os.path.join(HERE, "csv")
os.makedirs(CSV_DIR, exist_ok=True)

# ---------------------------------------------------------------- master data
COUNTRIES = ["Japan", "India", "Brazil", "Philippines", "Nigeria", "Germany", "USA"]
LANGS = ["ja", "en", "pt", "hi", "es"]
ERROR_TYPES = ["timestamp_drift", "wrong_speaker", "missed_segment",
               "bad_transcript", "wrong_emotion", "guideline_violation"]

FIRST = ["Aki","Ravi","Lucas","Mika","Chioma","Hans","Sara","Yuki","Diego","Priya",
         "Tomas","Nina","Kenji","Aisha","Bruno","Mei"]

# 各アノテーターに隠れた性質(skill: 0..1, speed: 速いほど大)を割り当てる。
# わざと「速くて雑」「遅くて丁寧」などの型を混ぜ、分析で発見できるようにする。
def make_annotators(n=14):
    rows = []
    base = dt.date(2026, 1, 1)
    for i in range(1, n + 1):
        skill = round(random.uniform(0.45, 0.97), 3)
        # rusher を意図的に作る: 一定確率で「速いのにスキル低い」
        if random.random() < 0.3:
            speed = round(random.uniform(0.75, 1.0), 3)
            skill = round(min(skill, random.uniform(0.45, 0.7)), 3)
        else:
            speed = round(random.uniform(0.4, 0.95), 3)
        tier = "senior" if skill > 0.8 else "junior"
        hired = base + dt.timedelta(days=random.randint(0, 120))
        rows.append({
            "annotator_id": i,
            "name": f"{random.choice(FIRST)}_{i:02d}",
            "country": random.choice(COUNTRIES),
            "tier": tier,
            "hired_date": hired.isoformat(),
            "_skill": skill,      # 隠れ変数(DBには入れない / 答え合わせ用にコメント)
            "_speed": speed,
        })
    return rows

def make_tasks(n=80):
    rows = []
    for i in range(1, n + 1):
        rows.append({
            "task_id": i,
            "batch": f"B{(i - 1) // 20 + 1:02d}",          # 20件ごとにバッチ
            "media_type": random.choice(["audio", "video"]),
            "language": random.choice(LANGS),
            "duration_sec": round(random.uniform(8, 90), 1),
            "difficulty": random.choice(["easy", "medium", "hard"]),
        })
    return rows

# ---------------------------------------------------------------- transactional
def build():
    annotators = make_annotators()
    tasks = make_tasks()
    skill = {a["annotator_id"]: a["_skill"] for a in annotators}
    speed = {a["annotator_id"]: a["_speed"] for a in annotators}

    annotations, segments, audits = [], [], []
    ann_id = seg_id = aud_id = 0
    reviewers = [a["annotator_id"] for a in annotators if a["tier"] == "senior"][:4] or [1]

    start_day = dt.datetime(2026, 3, 2, 9, 0, 0)
    for t in tasks:
        # 各タスクは 1〜3 人がアノテーション(重複は一致率分析の素地)
        workers = random.sample([a["annotator_id"] for a in annotators],
                                k=random.randint(1, 3))
        diff_mult = {"easy": 0.7, "medium": 1.0, "hard": 1.4}[t["difficulty"]]
        for w in workers:
            ann_id += 1
            # 作業時間: 尺 × 難易度 × (速い人ほど短い) × ノイズ
            base_time = t["duration_sec"] * diff_mult * 2.5
            time_spent = max(10, base_time * (1.3 - 0.7 * speed[w]) * random.uniform(0.8, 1.2))
            n_seg = max(1, int(t["duration_sec"] / random.uniform(3, 7)))
            submitted = start_day + dt.timedelta(
                days=random.randint(0, 27), minutes=random.randint(0, 540))
            annotations.append({
                "annotation_id": ann_id, "task_id": t["task_id"], "annotator_id": w,
                "submitted_at": submitted.isoformat(sep=" ", timespec="seconds"),
                "time_spent_sec": round(time_spent, 1),
                "num_segments": n_seg,
            })
            # segments
            cur = 0.0
            for s in range(n_seg):
                seg_id += 1
                dur = t["duration_sec"] / n_seg
                start = round(cur, 2); end = round(cur + dur * random.uniform(0.7, 1.0), 2)
                cur += dur
                segments.append({
                    "segment_id": seg_id, "annotation_id": ann_id,
                    "start_sec": start, "end_sec": min(end, t["duration_sec"]),
                    "speaker": random.choice(["Speaker 1", "Speaker 2", "Speaker 3", "N/A"]),
                    "emotion": random.choice(
                        ["neutral","happy","angry","sad","anxious","frustrated","excited","confused"]),
                    "vocal_delivery": random.choice(
                        ["calm","fast","hesitant","emphatic","monotone","whisper","laughing"]),
                    "transcript_len": random.randint(0, 120),
                })
            # audit: 品質スコアは skill 中心 + 難易度ペナルティ + ノイズ
            # (60 を下駄にして実運用らしい分布: 大半は承認、少数が棄却 にする)
            q = 60 + skill[w] * 38 - {"easy":0,"medium":4,"hard":9}[t["difficulty"]] \
                + random.gauss(0, 6)
            # 速くて雑な人はさらに減点(rusher の root cause を作る)
            if speed[w] > 0.75 and skill[w] < 0.7:
                q -= random.uniform(6, 14)
            q = max(0, min(100, round(q, 1)))
            verdict = "approved" if q >= 82 else "minor_fix" if q >= 68 else "rejected"
            err = None
            if verdict != "approved":
                # 弱点を持たせる: skill が低い人ほど bad_transcript / wrong_emotion 多め
                weights = [1,1,1,1,1,1]
                if skill[w] < 0.65:
                    weights[ERROR_TYPES.index("bad_transcript")] += 3
                    weights[ERROR_TYPES.index("wrong_emotion")] += 2
                if speed[w] > 0.8:
                    weights[ERROR_TYPES.index("missed_segment")] += 3
                    weights[ERROR_TYPES.index("timestamp_drift")] += 2
                err = random.choices(ERROR_TYPES, weights=weights, k=1)[0]
            aud_id += 1
            audited = submitted + dt.timedelta(hours=random.randint(1, 72))
            audits.append({
                "audit_id": aud_id, "annotation_id": ann_id,
                "reviewer_id": random.choice(reviewers),
                "quality_score": q, "verdict": verdict, "error_type": err,
                "audited_at": audited.isoformat(sep=" ", timespec="seconds"),
            })

    # 隠れ変数はDB/CSVから除く
    for a in annotators:
        a.pop("_skill"); a.pop("_speed")
    return annotators, tasks, annotations, segments, audits

# ---------------------------------------------------------------- write out
SCHEMA = """
DROP TABLE IF EXISTS audits;
DROP TABLE IF EXISTS segments;
DROP TABLE IF EXISTS annotations;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS annotators;

CREATE TABLE annotators (
  annotator_id INTEGER PRIMARY KEY,
  name        TEXT,
  country     TEXT,
  tier        TEXT,      -- 'junior' | 'senior'
  hired_date  TEXT
);
CREATE TABLE tasks (
  task_id      INTEGER PRIMARY KEY,
  batch        TEXT,
  media_type   TEXT,     -- 'audio' | 'video'
  language     TEXT,
  duration_sec REAL,
  difficulty   TEXT      -- 'easy' | 'medium' | 'hard'
);
CREATE TABLE annotations (
  annotation_id  INTEGER PRIMARY KEY,
  task_id        INTEGER REFERENCES tasks(task_id),
  annotator_id   INTEGER REFERENCES annotators(annotator_id),
  submitted_at   TEXT,
  time_spent_sec REAL,
  num_segments   INTEGER
);
CREATE TABLE segments (
  segment_id     INTEGER PRIMARY KEY,
  annotation_id  INTEGER REFERENCES annotations(annotation_id),
  start_sec      REAL,
  end_sec        REAL,
  speaker        TEXT,
  emotion        TEXT,
  vocal_delivery TEXT,
  transcript_len INTEGER
);
CREATE TABLE audits (
  audit_id      INTEGER PRIMARY KEY,
  annotation_id INTEGER REFERENCES annotations(annotation_id),
  reviewer_id   INTEGER REFERENCES annotators(annotator_id),
  quality_score REAL,
  verdict       TEXT,    -- 'approved' | 'minor_fix' | 'rejected'
  error_type    TEXT,    -- NULL if approved
  audited_at    TEXT
);
CREATE INDEX idx_ann_annotator ON annotations(annotator_id);
CREATE INDEX idx_seg_annotation ON segments(annotation_id);
CREATE INDEX idx_aud_annotation ON audits(annotation_id);
"""

def write_db(annotators, tasks, annotations, segments, audits):
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)

    def insert(table, rows, cols):
        ph = ",".join("?" * len(cols))
        con.executemany(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({ph})",
                        [tuple(r[c] for c in cols) for r in rows])

    insert("annotators", annotators, ["annotator_id","name","country","tier","hired_date"])
    insert("tasks", tasks, ["task_id","batch","media_type","language","duration_sec","difficulty"])
    insert("annotations", annotations,
           ["annotation_id","task_id","annotator_id","submitted_at","time_spent_sec","num_segments"])
    insert("segments", segments,
           ["segment_id","annotation_id","start_sec","end_sec","speaker","emotion","vocal_delivery","transcript_len"])
    insert("audits", audits,
           ["audit_id","annotation_id","reviewer_id","quality_score","verdict","error_type","audited_at"])
    con.commit()
    con.close()
    with open(os.path.join(HERE, "schema.sql"), "w") as f:
        f.write(SCHEMA.strip() + "\n")

def write_csv(name, rows, cols):
    with open(os.path.join(CSV_DIR, name + ".csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r[c] for c in cols})

def main():
    annotators, tasks, annotations, segments, audits = build()
    write_db(annotators, tasks, annotations, segments, audits)
    write_csv("annotators", annotators, ["annotator_id","name","country","tier","hired_date"])
    write_csv("tasks", tasks, ["task_id","batch","media_type","language","duration_sec","difficulty"])
    write_csv("annotations", annotations,
              ["annotation_id","task_id","annotator_id","submitted_at","time_spent_sec","num_segments"])
    write_csv("segments", segments,
              ["segment_id","annotation_id","start_sec","end_sec","speaker","emotion","vocal_delivery","transcript_len"])
    write_csv("audits", audits,
              ["audit_id","annotation_id","reviewer_id","quality_score","verdict","error_type","audited_at"])
    print(f"annotators={len(annotators)} tasks={len(tasks)} annotations={len(annotations)} "
          f"segments={len(segments)} audits={len(audits)}")
    print(f"wrote {DB}")

if __name__ == "__main__":
    main()
