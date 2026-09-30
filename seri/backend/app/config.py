"""Seri settings and business rules in one place.

Values marked (仮) are placeholders until they are decided with real buyers.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
(BASE_DIR / "data").mkdir(exist_ok=True)

DATABASE_URL = os.environ.get("SERI_DATABASE_URL", f"sqlite:///{BASE_DIR / 'data' / 'seri.db'}")
STORAGE_DIR = Path(os.environ.get("SERI_STORAGE_DIR", BASE_DIR / "data" / "uploads"))
COOKIE_SECURE = os.environ.get("SERI_COOKIE_SECURE", "0") == "1"  # set to 1 behind HTTPS
SESSION_HOURS = 12
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

# Terms the creator must accept before submitting data. Bump the version when the text changes.
CONSENT_VERSION = "2026-10-01"
CONSENT_TEXT = (
    "私は、提出する音声が自分自身の声であり、他人の声や合成音声を含まないことを確認します。"
    "提出したデータがAIの学習のために第三者（AI企業・研究機関）へライセンスされること、"
    "一度学習に使われたデータはモデルから取り除けないことに同意します。"
    "本人の声を使ったなりすまし（音声の複製による別の発言の生成）への利用は禁止されます。"
)

# Money rules
CREATOR_SHARE_PCT = 90  # creators get 90% of each sale
IMMEDIATE_PCT = 70  # of the creator share, paid right away; the rest is held
HOLD_DAYS = 14  # held part is released after the buyer's review window

# Order tiers: who may fulfil the order, and the price multiplier
TIERS = {
    "any": {"label": "誰でも", "multiplier": 1.0, "min_percentile": 0.0},
    "top50": {"label": "上位50%", "multiplier": 1.2, "min_percentile": 0.5},
    "top25": {"label": "上位25%", "multiplier": 1.5, "min_percentile": 0.75},
    "top10": {"label": "上位10%", "multiplier": 2.0, "min_percentile": 0.9},
}
MIN_REVIEWS_FOR_RANK = 5  # creators need this many reviewed items before they get a rank

# Industries (職種). Only creators whose industry an admin verified can take industry orders.
INDUSTRIES = {
    "": {"label": "指定なし", "multiplier": 1.0},
    "nurse": {"label": "看護師", "multiplier": 1.2},  # (仮)
    "accountant": {"label": "経理", "multiplier": 1.2},  # (仮)
    "engineer": {"label": "エンジニア", "multiplier": 1.2},  # (仮)
    "sales": {"label": "営業", "multiplier": 1.2},  # (仮)
}

# Data categories. floor_jpy = the lowest unit price a buyer may offer (仮).
CATEGORIES = {
    "ja_voice": {"label": "日本語の音声", "floor_jpy": 100, "min_sec": 5, "max_sec": 120},
    "en_voice": {"label": "英語の音声", "floor_jpy": 100, "min_sec": 5, "max_sec": 120},
}

LICENSES = {
    "standard": "標準（非独占）",
    "term_exclusive": "期間独占",
    "buyout": "完全買い切り",
    "evaluation": "評価用",
}

# Audio checks
MIN_SAMPLE_RATE = 16000
MIN_LEVEL_DBFS = -40.0  # quieter than this on average = too quiet
MAX_CLIP_RATIO = 0.001  # more than 0.1% clipped samples = distorted
MAX_SILENCE_RATIO = 0.6  # more than 60% silence = mostly empty
