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
