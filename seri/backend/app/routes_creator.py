"""Creators: find work, submit recordings, and see their assets, level and income."""

import hashlib
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from . import ledger, models, quality
from .config import (CATEGORIES, CONSENT_VERSION, GOALS_JPY, GRADES, LEVELS, LICENSES, MAX_UPLOAD_BYTES,
                     ORDER_CAP_PCT)
from .db import get_db
from .security import audit, require_role
from .storage import storage
from .views import JST, balances, creator_income, creator_unit_jpy, iso, month_start, order_out

router = APIRouter()
creator_only = require_role("creator")


class AssetSettingsIn(BaseModel):
    listed: bool


def slots_left(db: DBSession, o: models.Order) -> int:
    used = db.query(models.Submission).filter(models.Submission.order_id == o.id,
                                              models.Submission.status.in_(["pending", "approved"])).count()
    return o.units - used


def creator_cap(o: models.Order) -> int:
    return max(1, math.ceil(o.units * ORDER_CAP_PCT / 100))


def _mine_in(db: DBSession, o: models.Order, user: models.User) -> int:
    return db.query(models.Submission).filter(models.Submission.order_id == o.id, models.Submission.creator_id == user.id,
                                              models.Submission.status.in_(["pending", "approved"])).count()


@router.get("/api/tasks")
def tasks(db: DBSession = Depends(get_db), user: models.User = Depends(creator_only)):
    if user.deletion_requested_at:
        return []
    out = []
    # featured orders are shown first; featuring never changes pay or review
    orders = (db.query(models.Order).filter_by(status="open", kind="commission")
              .order_by((models.Order.promo_fee_jpy > 0).desc(), models.Order.id.desc()).all())
    for o in orders:
        if not quality.can_take(db, user, o) or slots_left(db, o) <= 0:
            continue
        mine = _mine_in(db, o, user)
        if mine >= creator_cap(o):
            continue
        d = order_out(db, o)
        d["you_earn_jpy"] = creator_unit_jpy(ledger.next_unit_amount(db, o))
        d["your_remaining"] = creator_cap(o) - mine
        d["royalties"] = LICENSES[o.license]["exclusive_days"] is None or LICENSES[o.license]["exclusive_days"] > 0
        out.append(d)
    return out


@router.post("/api/tasks/{order_id}/submissions", status_code=201)
async def submit(order_id: int, request: Request, file: UploadFile = File(...), db: DBSession = Depends(get_db),
                 user: models.User = Depends(creator_only)):
    o = db.get(models.Order, order_id)
    if (not o or o.kind != "commission" or o.status != "open" or user.deletion_requested_at
            or not quality.can_take(db, user, o)):
        raise HTTPException(404, "この仕事は受けられません")
    if slots_left(db, o) <= 0:
        raise HTTPException(409, "この仕事はすでに埋まりました")
    if _mine_in(db, o, user) >= creator_cap(o):
        raise HTTPException(409, "この仕事で提出できる上限に達しました")
    consent = (db.query(models.Consent).filter_by(user_id=user.id, version=CONSENT_VERSION)
               .order_by(models.Consent.id.desc()).first())
    if not consent:
        raise HTTPException(403, "最新の同意書への同意が必要です")

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "ファイルが大きすぎます（20MBまで）")
    result = quality.check_wav(data, o.category)
    if not result["ok"]:
        # rejected before storage: nothing is kept (data minimisation)
        raise HTTPException(422, {"message": "自動チェックで不合格になりました", "reasons": result["reasons"]})
    digest = hashlib.sha256(data).hexdigest()
    if db.query(models.Submission).filter_by(sha256=digest).first():
        raise HTTPException(409, "同じ音声がすでに提出されています")
    key = storage.put(data)
    s = models.Submission(order_id=o.id, creator_id=user.id, file_key=key, sha256=digest, checks=result, status="pending")
    db.add(s)
    db.flush()
    audit(db, user, "submission.create", f"submission:{s.id}", {"order": o.id}, request)
    db.commit()
    return {"id": s.id, "status": s.status, "checks": result}


@router.get("/api/submissions/mine")
def my_submissions(db: DBSession = Depends(get_db), user: models.User = Depends(creator_only)):
    subs = db.query(models.Submission).filter_by(creator_id=user.id).order_by(models.Submission.id.desc()).limit(100)
    grades = {a.submission_id: a.grade for a in db.query(models.Asset).filter_by(creator_id=user.id)}
    return [{"id": s.id, "order_id": s.order_id, "status": s.status, "reason": s.reason, "grade": grades.get(s.id),
             "duration_sec": s.checks.get("metrics", {}).get("duration_sec"), "created_at": iso(s.created_at)}
            for s in subs]


def _month_label() -> str:
    d = datetime.now(timezone.utc).astimezone(JST)
    return f"{d.year}年{d.month}月"


@router.get("/api/creator/dashboard")
def dashboard(db: DBSession = Depends(get_db), user: models.User = Depends(creator_only)):
    stats = quality.creator_stats(db, user)
    level = quality.level_of(stats)
    month = creator_income(db, user.id, month_start())
    all_time = creator_income(db, user.id, datetime(2000, 1, 1, tzinfo=timezone.utc))
    return {
        **balances(db, user.id),
        "month": {**month, "label": _month_label()},
        "all_time": all_time,
        "goals": [{"jpy": j, "label": lb, "reached": month["total_jpy"] >= j,
                   "progress": min(1.0, month["total_jpy"] / j)} for j, lb in GOALS_JPY],
        "level": {"key": level, **LEVELS[level]},
        "next": quality.next_level(stats, level),
        "stats": stats,
        "royalties_on": level in ("regular", "pro", "top"),
    }


@router.get("/api/creator/assets")
def my_assets(db: DBSession = Depends(get_db), user: models.User = Depends(creator_only)):
    now = datetime.now(timezone.utc)
    rows = (db.query(models.Sale.asset_id, func.count(), func.coalesce(func.sum(models.Sale.creator_jpy), 0))
            .join(models.Asset, models.Asset.id == models.Sale.asset_id)
            .filter(models.Asset.creator_id == user.id, models.Sale.refunded.is_(False))
            .group_by(models.Sale.asset_id).all())
    sold = {aid: n for aid, n, _ in rows}
    earned = {aid: jpy for aid, _, jpy in rows}
    out = []
    for a in db.query(models.Asset).filter_by(creator_id=user.id).order_by(models.Asset.id.desc()).limit(500):
        exclusive = a.exclusive_until and models.aware(a.exclusive_until) > now
        out.append({"id": a.id, "category_label": CATEGORIES[a.category]["label"], "grade": a.grade,
                    "grade_label": GRADES[a.grade]["label"], "duration_sec": a.duration_sec, "listed": a.listed,
                    "status": a.status, "sold": sold.get(a.id, 0), "earned_jpy": earned.get(a.id, 0),
                    "exclusive_until": iso(a.exclusive_until) if exclusive else None,
                    "forever_exclusive": bool(exclusive and models.aware(a.exclusive_until).year == 9999),
                    "in_catalog": quality.catalog_eligible(db, a, now), "created_at": iso(a.created_at)})
    return out


@router.post("/api/creator/assets/{asset_id}")
def asset_settings(asset_id: int, body: AssetSettingsIn, request: Request, db: DBSession = Depends(get_db),
                   user: models.User = Depends(creator_only)):
    a = db.get(models.Asset, asset_id)
    if not a or a.creator_id != user.id:
        raise HTTPException(404, "見つかりません")
    a.listed = body.listed
    audit(db, user, "asset.listed" if body.listed else "asset.unlisted", f"asset:{a.id}", request=request)
    db.commit()
    return {"id": a.id, "listed": a.listed}


@router.get("/api/earnings")
def earnings(db: DBSession = Depends(get_db), user: models.User = Depends(creator_only)):
    sales = (db.query(models.Sale, models.Order, models.User)
             .join(models.Asset, models.Asset.id == models.Sale.asset_id)
             .join(models.Order, models.Order.id == models.Sale.order_id)
             .join(models.User, models.User.id == models.Sale.buyer_id)
             .filter(models.Asset.creator_id == user.id).order_by(models.Sale.id.desc()).limit(200).all())
    return {
        **balances(db, user.id),
        "sales": [{"sale_id": s.id, "asset_id": s.asset_id, "buyer": b.org or "非公開",
                   "category": CATEGORIES[o.category]["label"], "license": LICENSES[s.license]["label"],
                   "kind": s.kind, "kind_label": "印税" if s.kind == "royalty" else "作業代",
                   "price_jpy": s.amount_jpy, "you_jpy": s.creator_jpy, "refunded": s.refunded,
                   "at": iso(s.created_at)} for s, o, b in sales],
    }
