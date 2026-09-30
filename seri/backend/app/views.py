"""How rows are shown to the web app. Shared by every route module."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from . import ledger, models
from .config import CATEGORIES, CONSENT_VERSION, CREATOR_SHARE_PCT, FALLBACKS, GRADES, INDUSTRIES, LICENSES, TIERS

JST = ZoneInfo("Asia/Tokyo")


def iso(dt: datetime | None) -> str | None:
    return models.aware(dt).isoformat() if dt else None


def user_out(db: DBSession, u: models.User) -> dict:
    out = {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "org": u.org,
           "industry": u.industry, "industry_label": INDUSTRIES.get(u.industry, {}).get("label", ""),
           "industry_verified": u.industry_verified, "accept_buyout": u.accept_buyout, "suspended": u.suspended,
           "deletion_requested": u.deletion_requested_at is not None}
    if u.role == "creator":
        latest = db.query(models.Consent).filter_by(user_id=u.id).order_by(models.Consent.id.desc()).first()
        out["consent_current"] = bool(latest and latest.version == CONSENT_VERSION)
    return out


def order_out(db: DBSession, o: models.Order) -> dict:
    delivered = db.query(models.Sale).filter_by(order_id=o.id).count()
    pending = db.query(models.Submission).filter_by(order_id=o.id, status="pending").count()
    return {"id": o.id, "kind": o.kind, "kind_label": "カタログ" if o.kind == "catalog" else "新規収集",
            "category": o.category, "category_label": CATEGORIES[o.category]["label"],
            "units": o.units, "unit_price_jpy": o.unit_price_jpy, "tier": o.tier, "tier_label": TIERS[o.tier]["label"],
            "industry": o.industry, "industry_label": INDUSTRIES[o.industry]["label"], "license": o.license,
            "license_label": LICENSES[o.license]["label"], "total_jpy": o.total_jpy, "promo_fee_jpy": o.promo_fee_jpy,
            "invoice_jpy": o.total_jpy + o.promo_fee_jpy, "refunded_jpy": o.refunded_jpy, "promoted": o.promo_fee_jpy > 0,
            "fallback": o.fallback, "fallback_label": FALLBACKS[o.fallback], "deadline_days": o.deadline_days,
            "deadline_at": iso(o.deadline_at), "status": o.status, "instructions": o.instructions,
            "delivered": delivered, "pending": pending, "created_at": iso(o.created_at)}


def catalog_price(asset: models.Asset) -> int:
    return round(CATEGORIES[asset.category]["catalog_jpy"] * GRADES[asset.grade]["multiplier"])


def catalog_item_out(db: DBSession, a: models.Asset) -> dict:
    creator = db.get(models.User, a.creator_id)
    industry = creator.industry if creator.industry_verified else ""
    return {"id": a.id, "category": a.category, "category_label": CATEGORIES[a.category]["label"],
            "grade": a.grade, "grade_label": GRADES[a.grade]["label"], "duration_sec": a.duration_sec,
            "industry": industry, "industry_label": INDUSTRIES[industry]["label"] if industry else "",
            "price_jpy": catalog_price(a), "created_at": iso(a.created_at)}


def creator_unit_jpy(amount: int) -> int:
    return amount * CREATOR_SHARE_PCT // 100


def month_start(at: datetime | None = None, months_back: int = 0) -> datetime:
    """Start of a calendar month in Japan time, as UTC."""
    local = (at or datetime.now(timezone.utc)).astimezone(JST)
    y, m = local.year, local.month - months_back
    while m < 1:
        y, m = y - 1, m + 12
    return datetime(y, m, 1, tzinfo=JST).astimezone(timezone.utc)


def creator_income(db: DBSession, creator_id: int, start: datetime, end: datetime | None = None) -> dict:
    """What a creator earned in a period, split into task pay and royalties. Refunded sales do not count."""
    q = (db.query(models.Sale.kind, func.coalesce(func.sum(models.Sale.creator_jpy), 0))
         .join(models.Asset, models.Asset.id == models.Sale.asset_id)
         .filter(models.Asset.creator_id == creator_id, models.Sale.refunded.is_(False), models.Sale.created_at >= start))
    if end:
        q = q.filter(models.Sale.created_at < end)
    by_kind = dict(q.group_by(models.Sale.kind).all())
    task, royalty = by_kind.get("task", 0), by_kind.get("royalty", 0)
    return {"task_jpy": task, "royalty_jpy": royalty, "total_jpy": task + royalty}


def success_stats(db: DBSession, months_back: int = 1) -> dict:
    """Of creators who submitted anything in a month, how many earned ¥30,000+ that month."""
    start, end = month_start(months_back=months_back), month_start(months_back=months_back - 1)
    active = {cid for (cid,) in db.query(models.Submission.creator_id)
              .filter(models.Submission.created_at >= start, models.Submission.created_at < end).distinct()}
    reached = [cid for cid in active if creator_income(db, cid, start, end)["total_jpy"] >= 30_000]
    return {"month": start.astimezone(JST).strftime("%Y-%m"), "active": len(active), "reached_30k": len(reached),
            "rate": (len(reached) / len(active)) if active else None}


def balances(db: DBSession, creator_id: int) -> dict:
    return {"available_jpy": -ledger.balance(db, f"creator:{creator_id}:available"),
            "held_jpy": -ledger.balance(db, f"creator:{creator_id}:held")}
