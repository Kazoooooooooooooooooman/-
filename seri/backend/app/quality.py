"""Automatic checks on a submitted recording, and creator quality ranks.

The browser converts every recording to 16-bit PCM WAV before upload, so the server
only needs the standard library to read it.
"""

import io
import math
import wave
from array import array
from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from . import models
from .config import (CATEGORIES, GRADES, LEVEL_RULES, LEVELS, LICENSES, MAX_CLIP_RATIO, MAX_SILENCE_RATIO,
                     MIN_LEVEL_DBFS, MIN_REVIEWS_FOR_RANK, MIN_SAMPLE_RATE, TIERS)


def check_wav(data: bytes, category: str) -> dict:
    """Returns {"ok": bool, "reasons": [...], "metrics": {...}}. Reasons are shown to the creator."""
    reasons: list[str] = []
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return {"ok": False, "reasons": ["WAV形式の音声ではありません"], "metrics": {}}
    try:
        with wave.open(io.BytesIO(data)) as w:
            channels, width, rate, frames = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
            raw = w.readframes(frames)
    except (wave.Error, EOFError):
        return {"ok": False, "reasons": ["音声ファイルを読み取れませんでした"], "metrics": {}}
    if width != 2:
        return {"ok": False, "reasons": ["16bitの音声にしてください"], "metrics": {}}

    samples = array("h")
    samples.frombytes(raw[: len(raw) // 2 * 2])
    if channels > 1:  # use the first channel for level checks
        samples = samples[::channels]
    n = len(samples)
    duration = frames / rate if rate else 0.0
    cat = CATEGORIES[category]

    if rate < MIN_SAMPLE_RATE:
        reasons.append(f"サンプルレートが低すぎます（{rate}Hz）。{MIN_SAMPLE_RATE}Hz以上で録音してください")
    if duration < cat["min_sec"]:
        reasons.append(f"短すぎます（{duration:.1f}秒）。{cat['min_sec']}秒以上話してください")
    if duration > cat["max_sec"]:
        reasons.append(f"長すぎます（{duration:.1f}秒）。{cat['max_sec']}秒以内にしてください")

    metrics = {"duration_sec": round(duration, 2), "sample_rate": rate, "channels": channels}
    if n:
        clip = sum(1 for s in samples if s >= 32767 or s <= -32768) / n
        # loudness per 50 ms window, to find silence
        win = max(1, rate // 20)
        levels = []
        for i in range(0, n, win):
            chunk = samples[i:i + win]
            rms = math.sqrt(sum(s * s for s in chunk) / len(chunk)) if chunk else 0.0
            levels.append(20 * math.log10(rms / 32768) if rms > 0 else -120.0)
        silence = sum(1 for lv in levels if lv < -50) / len(levels)
        voiced = [lv for lv in levels if lv >= -50]
        level = sum(voiced) / len(voiced) if voiced else -120.0
        metrics.update({"level_dbfs": round(level, 1), "clip_ratio": round(clip, 5), "silence_ratio": round(silence, 3)})
        if level < MIN_LEVEL_DBFS:
            reasons.append("声が小さすぎます。マイクに近づいて録音してください")
        if clip > MAX_CLIP_RATIO:
            reasons.append("音が割れています。マイクから少し離れて録音してください")
        if silence > MAX_SILENCE_RATIO:
            reasons.append("無音の部分が多すぎます")
    return {"ok": not reasons, "reasons": reasons, "metrics": metrics}


# ---------- quality score and rank ----------


def scores(db: DBSession, category: str) -> dict[int, tuple[float, int]]:
    """creator_id -> (score, reviewed count) in one category.

    Score (仮) = graded approvals (A 1.0, B 0.75, C 0.5) over everything reviewed, smoothed toward 50%.
    A buyer complaint that was upheld counts as a rejection, so bad data lowers the rank that earned it.
    """
    weights = {g: v["weight"] for g, v in GRADES.items()}
    points: dict[int, list[float]] = {}  # creator -> [points, reviewed]
    rejected = (
        db.query(models.Submission.creator_id, func.count())
        .join(models.Order, models.Order.id == models.Submission.order_id)
        .filter(models.Order.category == category, models.Submission.status == "rejected")
        .group_by(models.Submission.creator_id).all()
    )
    for cid, n in rejected:
        points.setdefault(cid, [0.0, 0])[1] += n
    graded = (
        db.query(models.Asset.creator_id, models.Asset.grade, func.count())
        .filter(models.Asset.category == category).group_by(models.Asset.creator_id, models.Asset.grade).all()
    )
    for cid, grade, n in graded:
        p = points.setdefault(cid, [0.0, 0])
        p[0] += weights.get(grade, 0.5) * n
        p[1] += n
    upheld = (
        db.query(models.Asset.creator_id, func.count())
        .join(models.Sale, models.Sale.asset_id == models.Asset.id)
        .join(models.Dispute, models.Dispute.sale_id == models.Sale.id)
        .filter(models.Asset.category == category, models.Dispute.status == "upheld")
        .group_by(models.Asset.creator_id).all()
    )
    for cid, n in upheld:
        p = points.setdefault(cid, [0.0, 0])
        p[1] += n  # an extra failed review for each upheld complaint
    return {cid: ((pts + 2) / (n + 4), n) for cid, (pts, n) in points.items()}


def percentile(db: DBSession, creator: models.User, category: str, industry: str = "",
               _scores: dict | None = None) -> float | None:
    """Share of ranked creators (in the same industry, when given) scoring at or below this creator."""
    all_scores = _scores if _scores is not None else scores(db, category)
    mine = all_scores.get(creator.id)
    if not mine or mine[1] < MIN_REVIEWS_FOR_RANK:
        return None
    pool_ids = {cid for cid, (_, n) in all_scores.items() if n >= MIN_REVIEWS_FOR_RANK}
    if industry:
        verified = {u.id for u in db.query(models.User).filter_by(industry=industry, industry_verified=True)}
        pool_ids &= verified
    pool = [all_scores[c][0] for c in pool_ids]
    if not pool:
        return None
    return sum(1 for s in pool if s <= mine[0]) / len(pool)


def can_take(db: DBSession, creator: models.User, order: models.Order) -> bool:
    if creator.suspended:
        return False
    if order.license == "buyout" and not creator.accept_buyout:
        return False  # buyout means no royalties ever, so the creator must opt in
    if order.industry and not (creator.industry == order.industry and creator.industry_verified):
        return False
    need = TIERS[order.tier]["min_percentile"]
    if need == 0:
        return True
    pct = percentile(db, creator, order.category, order.industry)
    return pct is not None and pct >= need


# ---------- creator level ----------


def creator_stats(db: DBSession, creator: models.User) -> dict:
    approved = db.query(models.Asset).filter_by(creator_id=creator.id).count()
    a_count = db.query(models.Asset).filter_by(creator_id=creator.id, grade="A").count()
    buyers = (db.query(func.count(func.distinct(models.Sale.buyer_id)))
              .join(models.Asset, models.Asset.id == models.Sale.asset_id)
              .filter(models.Asset.creator_id == creator.id, models.Sale.refunded.is_(False)).scalar())
    ranks = []
    for cat, c in CATEGORIES.items():
        sc = scores(db, cat)
        if creator.id not in sc:
            continue
        overall = percentile(db, creator, cat, _scores=sc)
        in_industry = (percentile(db, creator, cat, creator.industry, _scores=sc)
                       if creator.industry and creator.industry_verified else None)
        ranks.append({"category": cat, "category_label": c["label"], "score": round(sc[creator.id][0], 3),
                      "reviewed": sc[creator.id][1], "percentile": overall, "industry_percentile": in_industry})
    best = max([r["percentile"] or 0 for r in ranks] + [r["industry_percentile"] or 0 for r in ranks] + [0])
    return {"approved": approved, "a_rate": (a_count / approved) if approved else 0.0, "buyers": buyers,
            "ranks": ranks, "best_percentile": best}


def level_of(stats: dict) -> str:
    r = LEVEL_RULES
    if stats["approved"] < 1:
        return "new"
    if stats["approved"] < r["regular"]["approved"] or stats["a_rate"] < r["regular"]["a_rate"]:
        return "beginner"
    if stats["buyers"] < r["pro"]["buyers"]:
        return "regular"
    if stats["best_percentile"] < r["top"]["percentile"]:
        return "pro"
    return "top"


def next_level(stats: dict, level: str) -> dict | None:
    """What the creator still needs for the next level, in plain words."""
    r = LEVEL_RULES
    if level == "new":
        return {"level": "beginner", "label": LEVELS["beginner"]["label"], "needs": ["最初の1件が合格する"]}
    if level == "beginner":
        needs = []
        if stats["approved"] < r["regular"]["approved"]:
            needs.append(f"合格をあと{r['regular']['approved'] - stats['approved']}件")
        if stats["a_rate"] < r["regular"]["a_rate"]:
            needs.append(f"品質A の割合を{int(r['regular']['a_rate'] * 100)}%以上に（今 {int(stats['a_rate'] * 100)}%）")
        return {"level": "regular", "label": LEVELS["regular"]["label"], "needs": needs}
    if level == "regular":
        return {"level": "pro", "label": LEVELS["pro"]["label"],
                "needs": [f"あなたのデータを買った会社をあと{r['pro']['buyers'] - stats['buyers']}社"]}
    if level == "pro":
        return {"level": "top", "label": LEVELS["top"]["label"],
                "needs": [f"どれかのカテゴリー（または自分の職種の中）で上位{round((1 - r['top']['percentile']) * 100)}%に入る"]}
    return None


def catalog_eligible(db: DBSession, asset: models.Asset, at) -> bool:
    """Can this asset be re-licensed to another buyer right now?"""
    if asset.status != "active" or not asset.listed:
        return False
    if asset.exclusive_until and models.aware(asset.exclusive_until) > at:
        return False
    creator = db.get(models.User, asset.creator_id)
    if creator.suspended or creator.deletion_requested_at:
        return False
    return level_of(creator_stats(db, creator)) in ("regular", "pro", "top")


def exclusive_until(license: str, at):
    days = LICENSES[license]["exclusive_days"]
    if days is None:
        return None
    return at.replace(year=9999) if days == 0 else at + timedelta(days=days)
