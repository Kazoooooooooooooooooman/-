"""Order price = units × unit price × industry multiplier × tier multiplier (+ optional featuring fee)."""

from fastapi import HTTPException

from .config import CATEGORIES, FALLBACKS, INDUSTRIES, LICENSES, PROMO_FEE_JPY, TIERS

MAX_UNITS = 100_000
MAX_UNIT_PRICE = 1_000_000


def data_total(units: int, unit_price_jpy: int, tier: str, industry: str) -> int:
    return round(units * unit_price_jpy * INDUSTRIES[industry]["multiplier"] * TIERS[tier]["multiplier"])


def quote(category: str, units: int, unit_price_jpy: int, tier: str, industry: str = "", license: str = "standard",
          fallback: str = "extend", promoted: bool = False) -> dict:
    if category not in CATEGORIES:
        raise HTTPException(400, "データの種類が正しくありません")
    if tier not in TIERS:
        raise HTTPException(400, "注文の種類が正しくありません")
    if industry not in INDUSTRIES:
        raise HTTPException(400, "業界が正しくありません")
    if license not in LICENSES:
        raise HTTPException(400, "ライセンスが正しくありません")
    if fallback not in FALLBACKS:
        raise HTTPException(400, "期限切れの時の扱いが正しくありません")
    if not 1 <= units <= MAX_UNITS:
        raise HTTPException(400, f"件数は1〜{MAX_UNITS:,}件で指定してください")
    floor = CATEGORIES[category]["floor_jpy"]
    if not floor <= unit_price_jpy <= MAX_UNIT_PRICE:
        raise HTTPException(400, f"1件あたりの価格は{floor:,}円以上にしてください（最低価格）")
    total = data_total(units, unit_price_jpy, tier, industry)
    promo = PROMO_FEE_JPY if promoted else 0
    return {
        "category": category,
        "units": units,
        "unit_price_jpy": unit_price_jpy,
        "tier": tier,
        "industry": industry,
        "license": license,
        "fallback": fallback,
        "promoted": promoted,
        "tier_multiplier": TIERS[tier]["multiplier"],
        "industry_multiplier": INDUSTRIES[industry]["multiplier"],
        "total_jpy": total,
        "promo_fee_jpy": promo,
        "invoice_jpy": total + promo,
        "deadline_days": TIERS[tier]["days"],
        "creator_unit_jpy": total // units * 90 // 100,
        "floor_jpy": floor,
    }
