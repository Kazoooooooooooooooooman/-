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

ORDER_CAP_PCT = 20  # one creator may fill at most 20% of an order, so earnings spread across people
PROMO_FEE_JPY = 5000  # (仮) flat fee to feature an order. Changes display order only, never price or review

# Order tiers: who may fulfil the order, the price multiplier, and the default time to fill it.
# Listed from lowest to highest; a missed deadline can step an order down one tier.
TIERS = {
    "any": {"label": "誰でも", "multiplier": 1.0, "min_percentile": 0.0, "days": 14},
    "top50": {"label": "上位50%", "multiplier": 1.2, "min_percentile": 0.5, "days": 21},
    "top25": {"label": "上位25%", "multiplier": 1.5, "min_percentile": 0.75, "days": 28},
    "top10": {"label": "上位10%", "multiplier": 2.0, "min_percentile": 0.9, "days": 42},
}
# What happens when an order is not filled by its deadline (the buyer picks when ordering)
FALLBACKS = {
    "extend": "期限を延ばす",
    "downgrade": "1つ下の段階に落として差額を返金",
    "refund": "集まった分で終了し残りを返金",
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
# catalog_jpy = list price of one grade-B item re-licensed from the catalog (仮).
CATEGORIES = {
    "ja_voice": {"label": "日本語の音声", "floor_jpy": 100, "catalog_jpy": 150, "min_sec": 5, "max_sec": 120},
    "en_voice": {"label": "英語の音声", "floor_jpy": 100, "catalog_jpy": 150, "min_sec": 5, "max_sec": 120},
}

# Licenses. Standard is non-exclusive: the asset can be sold again and again, paying a royalty each time.
# exclusive_days: how long no one else may buy it (None = never exclusive, 0 = forever).
LICENSES = {
    "standard": {"label": "標準（非独占）", "exclusive_days": None},
    "term_exclusive": {"label": "期間独占（6ヶ月）", "exclusive_days": 180},
    "buyout": {"label": "完全買い切り", "exclusive_days": 0},
    "evaluation": {"label": "評価用", "exclusive_days": 0},
}

# Quality grades a reviewer gives on approval. Weight feeds the quality score, multiplier the catalog price (仮).
GRADES = {
    "A": {"label": "A（とても良い）", "weight": 1.0, "multiplier": 1.5},
    "B": {"label": "B（良い）", "weight": 0.75, "multiplier": 1.0},
    "C": {"label": "C（使える）", "weight": 0.5, "multiplier": 0.7},
}

# Creator levels (仮). Each level needs the one before it.
LEVEL_RULES = {
    "regular": {"approved": 100, "a_rate": 0.9},  # royalties: assets enter the catalog
    "pro": {"buyers": 30},  # sold to 30+ different companies
    "top": {"percentile": 0.99},  # top 1% in a category (or within their verified industry)
}
LEVELS = {
    "new": {"label": "はじめて", "perk": "最初の合格を目指しましょう"},
    "beginner": {"label": "ビギナー", "perk": "注文に応じた作業代"},
    "regular": {"label": "レギュラー", "perk": "データがカタログに載り、売れるたびに印税"},
    "pro": {"label": "プロ", "perk": "指名の注文、最低価格の引き上げ"},
    "top": {"label": "トップ", "perk": "AI企業の定期購読、スカウト"},
}

# Monthly income goals (Seri's definition of success for people working 10+ hours a month)
GOALS_JPY = [(30_000, "全員の土台"), (100_000, "副業として成立"), (300_000, "それで生活できる")]

# Audio checks
MIN_SAMPLE_RATE = 16000
MIN_LEVEL_DBFS = -40.0  # quieter than this on average = too quiet
MAX_CLIP_RATIO = 0.001  # more than 0.1% clipped samples = distorted
MAX_SILENCE_RATIO = 0.6  # more than 60% silence = mostly empty
