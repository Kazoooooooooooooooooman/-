"""Automatic checks on a submitted recording, and creator quality ranks.

The browser converts every recording to 16-bit PCM WAV before upload, so the server
only needs the standard library to read it.
"""

import io
import math
import wave
from array import array

from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from . import models
from .config import (CATEGORIES, MAX_CLIP_RATIO, MAX_SILENCE_RATIO, MIN_LEVEL_DBFS, MIN_REVIEWS_FOR_RANK,
                     MIN_SAMPLE_RATE, TIERS)


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
    """creator_id -> (score, reviewed count). Score is the approval rate, smoothed toward 50%."""
    rows = (
        db.query(models.Submission.creator_id, models.Submission.status, func.count())
        .join(models.Order, models.Order.id == models.Submission.order_id)
        .filter(models.Order.category == category, models.Submission.status.in_(["approved", "rejected"]))
        .group_by(models.Submission.creator_id, models.Submission.status)
        .all()
    )
    counts: dict[int, list[int]] = {}
    for cid, status, c in rows:
        counts.setdefault(cid, [0, 0])[0 if status == "approved" else 1] += c
    return {cid: ((a + 2) / (a + r + 4), a + r) for cid, (a, r) in counts.items()}


def percentile(db: DBSession, creator: models.User, category: str, industry: str = "") -> float | None:
    """Share of ranked creators (in the same industry, when given) scoring at or below this creator."""
    all_scores = scores(db, category)
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
    if order.industry and not (creator.industry == order.industry and creator.industry_verified):
        return False
    need = TIERS[order.tier]["min_percentile"]
    if need == 0:
        return True
    pct = percentile(db, creator, order.category, order.industry)
    return pct is not None and pct >= need
