"""Buyers: order new data, re-license catalog data, receive it, and complain inside the review window."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from . import models, quality
from .config import CATEGORIES, CONSENT_VERSION, GRADES, HOLD_DAYS, INDUSTRIES, LICENSES
from .db import get_db
from .pricing import quote
from .routes_auth import QuoteIn
from .security import audit, require_role
from .storage import storage
from .views import catalog_item_out, catalog_price, iso, order_out

router = APIRouter()
buyer_only = require_role("buyer")
MAX_CATALOG_ITEMS = 500


class OrderIn(QuoteIn):
    instructions: str = Field(default="", max_length=2000)


class CatalogOrderIn(BaseModel):
    asset_ids: list[int] = Field(min_length=1, max_length=MAX_CATALOG_ITEMS)


class DisputeIn(BaseModel):
    reason: str = Field(min_length=5, max_length=1000)


def _own_order(db: DBSession, order_id: int, user: models.User) -> models.Order:
    o = db.get(models.Order, order_id)
    if not o or o.buyer_id != user.id:
        raise HTTPException(404, "注文が見つかりません")
    return o


@router.post("/api/orders", status_code=201)
def create_order(body: OrderIn, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(buyer_only)):
    q = quote(**body.model_dump(exclude={"instructions"}))
    o = models.Order(buyer_id=user.id, category=q["category"], instructions=body.instructions, units=q["units"],
                     unit_price_jpy=q["unit_price_jpy"], tier=q["tier"], industry=q["industry"], license=q["license"],
                     tier_multiplier=q["tier_multiplier"], industry_multiplier=q["industry_multiplier"],
                     total_jpy=q["total_jpy"], promo_fee_jpy=q["promo_fee_jpy"], fallback=q["fallback"],
                     deadline_days=q["deadline_days"])
    db.add(o)
    db.flush()
    audit(db, user, "order.create", f"order:{o.id}", {"total_jpy": o.total_jpy, "promo": o.promo_fee_jpy}, request)
    db.commit()
    return order_out(db, o)


@router.get("/api/orders/mine")
def my_orders(db: DBSession = Depends(get_db), user: models.User = Depends(buyer_only)):
    orders = db.query(models.Order).filter_by(buyer_id=user.id).order_by(models.Order.id.desc()).all()
    return [order_out(db, o) for o in orders]


@router.post("/api/orders/{order_id}/cancel")
def cancel_order(order_id: int, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(buyer_only)):
    o = _own_order(db, order_id, user)
    if o.status != "awaiting_payment":
        raise HTTPException(409, "入金後の注文はキャンセルできません。お問い合わせください")
    o.status = "cancelled"
    audit(db, user, "order.cancel", f"order:{o.id}", request=request)
    db.commit()
    return order_out(db, o)


# ---------- catalog ----------


def _licensed_by(db: DBSession, buyer_id: int) -> set[int]:
    """Assets this buyer already owns a license to, or has reserved in an unpaid catalog order."""
    owned = {a for (a,) in db.query(models.Sale.asset_id).filter_by(buyer_id=buyer_id, refunded=False)}
    reserved = {a for (a,) in db.query(models.OrderItem.asset_id).join(models.Order, models.Order.id == models.OrderItem.order_id)
                .filter(models.Order.buyer_id == buyer_id, models.OrderItem.status == "reserved",
                        models.Order.status == "awaiting_payment")}
    return owned | reserved


@router.get("/api/catalog")
def catalog(category: str = "ja_voice", grade: str = "", industry: str = "", limit: int = 100,
            db: DBSession = Depends(get_db), user: models.User = Depends(buyer_only)):
    """Verified assets available for a standard (non-exclusive) license right now."""
    if category not in CATEGORIES or (grade and grade not in GRADES) or industry not in INDUSTRIES:
        raise HTTPException(400, "条件が正しくありません")
    now = datetime.now(timezone.utc)
    skip = _licensed_by(db, user.id)
    q = db.query(models.Asset).filter_by(category=category, status="active", listed=True)
    if grade:
        q = q.filter_by(grade=grade)
    out = []
    for a in q.order_by(models.Asset.id.desc()).limit(2000):
        if a.id in skip or not quality.catalog_eligible(db, a, now):
            continue
        item = catalog_item_out(db, a)
        if industry and item["industry"] != industry:
            continue
        out.append(item)
        if len(out) >= min(limit, MAX_CATALOG_ITEMS):
            break
    return out


@router.post("/api/catalog/orders", status_code=201)
def catalog_order(body: CatalogOrderIn, request: Request, db: DBSession = Depends(get_db),
                  user: models.User = Depends(buyer_only)):
    ids = list(dict.fromkeys(body.asset_ids))
    now = datetime.now(timezone.utc)
    skip = _licensed_by(db, user.id)
    assets = []
    for aid in ids:
        a = db.get(models.Asset, aid)
        if not a or aid in skip or not quality.catalog_eligible(db, a, now):
            raise HTTPException(409, f"データ #{aid} は今は購入できません。一覧を読み込み直してください")
        assets.append(a)
    if len({a.category for a in assets}) != 1:
        raise HTTPException(400, "1回の注文は1つのデータの種類にしてください")
    prices = [catalog_price(a) for a in assets]
    total = sum(prices)
    o = models.Order(buyer_id=user.id, kind="catalog", category=assets[0].category, units=len(assets),
                     unit_price_jpy=total // len(assets), tier="any", industry="", license="standard",
                     tier_multiplier=1.0, industry_multiplier=1.0, total_jpy=total, fallback="refund", deadline_days=0)
    db.add(o)
    db.flush()
    for a, p in zip(assets, prices):
        db.add(models.OrderItem(order_id=o.id, asset_id=a.id, price_jpy=p))
    audit(db, user, "order.create_catalog", f"order:{o.id}", {"items": len(assets), "total_jpy": total}, request)
    db.commit()
    return order_out(db, o)


# ---------- delivery ----------


def _dispute_state(db: DBSession, sale: models.Sale, now: datetime) -> dict:
    d = db.query(models.Dispute).filter_by(sale_id=sale.id).first()
    window_end = models.aware(sale.created_at) + timedelta(days=HOLD_DAYS)
    return {"dispute": d.status if d else None, "dispute_until": window_end.isoformat(),
            "can_dispute": d is None and not sale.refunded and now < window_end}


@router.get("/api/orders/{order_id}/datacard")
def datacard(order_id: int, db: DBSession = Depends(get_db), user: models.User = Depends(buyer_only)):
    """Machine-readable summary of what was delivered, for the buyer's people and agents."""
    o = _own_order(db, order_id, user)
    rows = (db.query(models.Sale, models.Asset)
            .join(models.Asset, models.Asset.id == models.Sale.asset_id)
            .filter(models.Sale.order_id == o.id).order_by(models.Sale.id).all())
    now = datetime.now(timezone.utc)
    live = [(s, a) for s, a in rows if not s.refunded]
    grades = {g: sum(1 for _, a in live if a.grade == g) for g in GRADES}
    return {
        "schema": "seri.datacard.v1",
        "order_id": o.id,
        "kind": o.kind,
        "category": o.category,
        "license": o.license,
        "license_terms": LICENSES[o.license]["label"],
        "items": len(live),
        "refunded_items": len(rows) - len(live),
        "creators": len({a.creator_id for _, a in live}),
        "total_duration_sec": round(sum(a.duration_sec for _, a in live), 2),
        "grades": grades,
        "tier": o.tier,
        "industry": o.industry or None,
        "verification": {"standard": "Seri Standard 日本語・英語音声 v1", "automatic_checks": True,
                         "human_review": "every item", "consent_version": CONSENT_VERSION,
                         "impersonation_prohibited": True},
        "assets": [{"asset_id": a.id, "sale_id": s.id, "sha256": a.sha256, "grade": a.grade, "duration_sec": a.duration_sec,
                    "refunded": s.refunded, "download": None if s.refunded else f"/api/assets/{a.id}/download",
                    **_dispute_state(db, s, now)} for s, a in rows],
    }


@router.get("/api/assets/{asset_id}/download")
def download_asset(asset_id: int, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(buyer_only)):
    sale = db.query(models.Sale).filter_by(asset_id=asset_id, buyer_id=user.id, refunded=False).first()
    if not sale:
        raise HTTPException(404, "データが見つかりません")
    asset = db.get(models.Asset, asset_id)
    sub = db.get(models.Submission, asset.submission_id)
    audit(db, user, "asset.download", f"asset:{asset_id}", request=request)
    db.commit()
    return FileResponse(storage.path(sub.file_key), media_type="audio/wav", filename=f"seri-{asset_id}.wav")


@router.post("/api/sales/{sale_id}/dispute", status_code=201)
def open_dispute(sale_id: int, body: DisputeIn, request: Request, db: DBSession = Depends(get_db),
                 user: models.User = Depends(buyer_only)):
    sale = db.get(models.Sale, sale_id)
    if not sale or sale.buyer_id != user.id:
        raise HTTPException(404, "見つかりません")
    if not _dispute_state(db, sale, datetime.now(timezone.utc))["can_dispute"]:
        raise HTTPException(409, f"このデータへの報告期間（{HOLD_DAYS}日）は終わっているか、すでに報告済みです")
    d = models.Dispute(sale_id=sale.id, buyer_id=user.id, reason=body.reason.strip())
    db.add(d)
    db.flush()
    audit(db, user, "dispute.open", f"sale:{sale.id}", {"dispute": d.id}, request)
    db.commit()
    return {"id": d.id, "status": d.status, "created_at": iso(d.created_at)}
