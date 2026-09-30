"""Order price = units × unit price × industry multiplier × tier multiplier."""

from fastapi import HTTPException

from .config import CATEGORIES, INDUSTRIES, LICENSES, TIERS

MAX_UNITS = 100_000
MAX_UNIT_PRICE = 1_000_000


def quote(category: str, units: int, unit_price_jpy: int, tier: str, industry: str = "", license: str = "standard") -> dict:
    if category not in CATEGORIES:
        raise HTTPException(400, "データの種類が正しくありません")
    if tier not in TIERS:
        raise HTTPException(400, "注文の種類が正しくありません")
    if industry not in INDUSTRIES:
        raise HTTPException(400, "業界が正しくありません")
    if license not in LICENSES:
        raise HTTPException(400, "ライセンスが正しくありません")
    if not 1 <= units <= MAX_UNITS:
        raise HTTPException(400, f"件数は1〜{MAX_UNITS:,}件で指定してください")
    floor = CATEGORIES[category]["floor_jpy"]
    if not floor <= unit_price_jpy <= MAX_UNIT_PRICE:
        raise HTTPException(400, f"1件あたりの価格は{floor:,}円以上にしてください（最低価格）")
    tm = TIERS[tier]["multiplier"]
    im = INDUSTRIES[industry]["multiplier"]
    total = round(units * unit_price_jpy * im * tm)
    return {
        "category": category,
        "units": units,
        "unit_price_jpy": unit_price_jpy,
        "tier": tier,
        "industry": industry,
        "license": license,
        "tier_multiplier": tm,
        "industry_multiplier": im,
        "total_jpy": total,
        "floor_jpy": floor,
    }
