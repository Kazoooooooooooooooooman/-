"""Reviewers judge submissions. Admins run payments, deadlines, complaints, people and checks."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from . import ledger, models, quality
from .config import CATEGORIES, GRADES, INDUSTRIES, LEVELS, TIERS
from .db import get_db
from .pricing import data_total
from .security import audit, require_role
from .storage import storage
from .views import catalog_item_out, iso, order_out, success_stats, user_out

router = APIRouter()
staff = require_role("reviewer", "admin")
admin_only = require_role("admin")


class ReviewIn(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    grade: str = ""
    reason: str = Field(default="", max_length=500)


class DisputeDecisionIn(BaseModel):
    decision: str = Field(pattern="^(uphold|reject)$")
    note: str = Field(default="", max_length=500)


class SuspendIn(BaseModel):
    suspended: bool


# ---------- review ----------


@router.get("/api/review/queue")
def review_queue(db: DBSession = Depends(get_db), user: models.User = Depends(staff)):
    subs = (db.query(models.Submission).filter(models.Submission.status == "pending",
                                               models.Submission.creator_id != user.id)
            .order_by(models.Submission.id).limit(50).all())
    out = []
    for s in subs:
        o = db.get(models.Order, s.order_id)
        out.append({"id": s.id, "order_id": o.id, "category": CATEGORIES[o.category]["label"],
                    "tier_label": TIERS[o.tier]["label"], "industry_label": INDUSTRIES[o.industry]["label"],
                    "instructions": o.instructions, "checks": s.checks, "created_at": iso(s.created_at)})
    return out


@router.get("/api/review/{submission_id}/audio")
def review_audio(submission_id: int, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(staff)):
    s = db.get(models.Submission, submission_id)
    if not s:
        raise HTTPException(404, "見つかりません")
    audit(db, user, "submission.listen", f"submission:{s.id}", request=request)
    db.commit()
    return FileResponse(storage.path(s.file_key), media_type="audio/wav")


@router.post("/api/review/{submission_id}")
def review(submission_id: int, body: ReviewIn, request: Request, db: DBSession = Depends(get_db),
           user: models.User = Depends(staff)):
    s = db.get(models.Submission, submission_id)
    if not s or s.status != "pending":
        raise HTTPException(404, "審査待ちの提出が見つかりません")
    if s.creator_id == user.id:
        raise HTTPException(403, "自分の提出は審査できません")
    o = db.get(models.Order, s.order_id)
    now = datetime.now(timezone.utc)
    if body.decision == "reject":
        if not body.reason.strip():
            raise HTTPException(400, "不合格の理由を書いてください（クリエイターに届きます）")
        s.status, s.reason = "rejected", body.reason.strip()
    else:
        if body.grade not in GRADES:
            raise HTTPException(400, "品質グレード（A・B・C）を選んでください")
        if o.status != "open":
            raise HTTPException(409, "この注文はすでに終了しています")
        consent = db.query(models.Consent).filter_by(user_id=s.creator_id).order_by(models.Consent.id.desc()).first()
        s.status = "approved"
        asset = models.Asset(submission_id=s.id, creator_id=s.creator_id, category=o.category, sha256=s.sha256,
                             consent_id=consent.id, grade=body.grade,
                             duration_sec=s.checks.get("metrics", {}).get("duration_sec", 0.0),
                             exclusive_until=quality.exclusive_until(o.license, now))
        db.add(asset)
        db.flush()
        ledger.settle(db, o, asset, ledger.next_unit_amount(db, o), "task")
        if ledger.units_left(db, o) <= 0:
            o.status = "filled"
    s.reviewed_by, s.reviewed_at = user.id, now
    audit(db, user, f"submission.{body.decision}", f"submission:{s.id}", {"reason": s.reason, "grade": body.grade}, request)
    db.commit()
    return {"id": s.id, "status": s.status}


# ---------- orders and money ----------


@router.get("/api/admin/orders")
def all_orders(db: DBSession = Depends(get_db), user: models.User = Depends(admin_only)):
    rows = []
    for o in db.query(models.Order).order_by(models.Order.id.desc()).limit(200):
        buyer = db.get(models.User, o.buyer_id)
        rows.append(order_out(db, o) | {"buyer": buyer.org or buyer.name})
    return rows


@router.post("/api/admin/orders/{order_id}/mark-paid")
def mark_paid(order_id: int, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(admin_only)):
    o = db.get(models.Order, order_id)
    if not o or o.status != "awaiting_payment":
        raise HTTPException(404, "入金待ちの注文が見つかりません")
    ledger.record_payment(db, o)
    now = datetime.now(timezone.utc)
    detail = {"invoice_jpy": o.total_jpy + o.promo_fee_jpy}
    if o.kind == "commission":
        o.status = "open"
        o.deadline_at = now + timedelta(days=o.deadline_days)
    else:
        # catalog: license each item now; anything that stopped being available is refunded
        owned = {a for (a,) in db.query(models.Sale.asset_id).filter_by(buyer_id=o.buyer_id, refunded=False)}
        sold = refunded = 0
        for item in db.query(models.OrderItem).filter_by(order_id=o.id, status="reserved"):
            asset = db.get(models.Asset, item.asset_id)
            if item.asset_id not in owned and quality.catalog_eligible(db, asset, now):
                ledger.settle(db, o, asset, item.price_jpy, "royalty")
                item.status, sold = "sold", sold + 1
            else:
                ledger.refund_order(db, o, item.price_jpy, f"catalog item {item.id} unavailable")
                item.status, refunded = "refunded", refunded + 1
        o.status = "filled" if sold else "closed"
        detail |= {"sold": sold, "refunded": refunded}
    audit(db, user, "order.paid", f"order:{o.id}", detail, request)
    db.commit()
    return order_out(db, o) | detail


def process_deadlines(db: DBSession, at: datetime | None = None) -> list[dict]:
    """Apply each overdue order's chosen fallback. Orders with recordings still in review wait for the review."""
    at = at or datetime.now(timezone.utc)
    tiers = list(TIERS)
    done = []
    overdue = (db.query(models.Order).filter(models.Order.status == "open", models.Order.kind == "commission",
                                              models.Order.deadline_at.is_not(None)).all())
    for o in overdue:
        if models.aware(o.deadline_at) > at:
            continue
        if db.query(models.Submission).filter_by(order_id=o.id, status="pending").count():
            done.append({"order": o.id, "action": "waiting_review"})
            continue
        left = ledger.units_left(db, o)
        remaining = ledger.order_remaining(db, o)
        action = o.fallback
        if action == "downgrade" and o.tier == tiers[0]:
            action = "extend"  # nothing below "anyone": keep looking
        if action == "extend":
            o.deadline_at = at + timedelta(days=TIERS[o.tier]["days"])
            done.append({"order": o.id, "action": "extend"})
        elif action == "downgrade":
            new_tier = tiers[tiers.index(o.tier) - 1]
            refund = remaining - data_total(left, o.unit_price_jpy, new_tier, o.industry)
            ledger.refund_order(db, o, max(0, refund), f"downgrade order {o.id} {o.tier}->{new_tier}")
            o.tier, o.tier_multiplier = new_tier, TIERS[new_tier]["multiplier"]
            o.deadline_at = at + timedelta(days=TIERS[new_tier]["days"])
            done.append({"order": o.id, "action": "downgrade", "tier": new_tier, "refund_jpy": max(0, refund)})
        else:
            ledger.refund_order(db, o, remaining, f"close order {o.id} at deadline")
            o.status = "closed"
            done.append({"order": o.id, "action": "refund", "refund_jpy": remaining})
    return done


@router.post("/api/admin/process-deadlines")
def run_deadlines(request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(admin_only)):
    done = process_deadlines(db)
    audit(db, user, "order.process_deadlines", "", {"results": done}, request)
    db.commit()
    return {"results": done}


@router.post("/api/admin/release-holds")
def release_holds(request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(admin_only)):
    n = ledger.release_due_holds(db)
    audit(db, user, "ledger.release_holds", "", {"released": n}, request)
    db.commit()
    return {"released": n}


@router.get("/api/admin/ledger/check")
def ledger_check(db: DBSession = Depends(get_db), user: models.User = Depends(admin_only)):
    return ledger.check_integrity(db)


@router.get("/api/admin/kpis")
def kpis(db: DBSession = Depends(get_db), user: models.User = Depends(admin_only)):
    live = db.query(models.Sale).filter(models.Sale.refunded.is_(False))
    return {
        "gmv_jpy": live.with_entities(func.coalesce(func.sum(models.Sale.amount_jpy), 0)).scalar(),
        "paid_to_creators_jpy": live.with_entities(func.coalesce(func.sum(models.Sale.creator_jpy), 0)).scalar(),
        "royalty_sales": live.filter(models.Sale.kind == "royalty").count(),
        "seri_revenue_jpy": -ledger.balance(db, "seri:revenue"),
        "escrow_jpy": ledger.balance(db, "cash:escrow"),
        "creators": db.query(models.User).filter_by(role="creator").count(),
        "buyers": db.query(models.User).filter_by(role="buyer").count(),
        "open_orders": db.query(models.Order).filter_by(status="open").count(),
        "awaiting_payment": db.query(models.Order).filter_by(status="awaiting_payment").count(),
        "pending_reviews": db.query(models.Submission).filter_by(status="pending").count(),
        "open_disputes": db.query(models.Dispute).filter_by(status="open").count(),
        "success_this_month": success_stats(db, months_back=0),
        "success_last_month": success_stats(db, months_back=1),
    }


# ---------- complaints ----------


@router.get("/api/admin/disputes")
def disputes(db: DBSession = Depends(get_db), user: models.User = Depends(admin_only)):
    out = []
    for d in db.query(models.Dispute).order_by((models.Dispute.status == "open").desc(), models.Dispute.id.desc()).limit(200):
        sale = db.get(models.Sale, d.sale_id)
        asset = db.get(models.Asset, sale.asset_id)
        buyer = db.get(models.User, d.buyer_id)
        hold = db.query(models.Hold).filter_by(sale_id=sale.id).first()
        out.append({"id": d.id, "status": d.status, "reason": d.reason, "resolution": d.resolution,
                    "buyer": buyer.org or buyer.name, "sale_id": sale.id, "order_id": sale.order_id,
                    "asset": catalog_item_out(db, asset), "amount_jpy": sale.amount_jpy,
                    "held_jpy": hold.amount_jpy if hold and not hold.released and not hold.cancelled else 0,
                    "audio": f"/api/admin/assets/{asset.id}/audio", "created_at": iso(d.created_at)})
    return out


@router.get("/api/admin/assets/{asset_id}/audio")
def asset_audio(asset_id: int, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(admin_only)):
    a = db.get(models.Asset, asset_id)
    if not a:
        raise HTTPException(404, "見つかりません")
    sub = db.get(models.Submission, a.submission_id)
    audit(db, user, "asset.listen", f"asset:{a.id}", request=request)
    db.commit()
    return FileResponse(storage.path(sub.file_key), media_type="audio/wav")


@router.post("/api/admin/disputes/{dispute_id}")
def decide_dispute(dispute_id: int, body: DisputeDecisionIn, request: Request, db: DBSession = Depends(get_db),
                   user: models.User = Depends(admin_only)):
    d = db.get(models.Dispute, dispute_id)
    if not d or d.status != "open":
        raise HTTPException(404, "対応待ちの報告が見つかりません")
    if not body.note.strip():
        raise HTTPException(400, "判断の理由を書いてください（買い手とクリエイターの記録に残ります）")
    detail = {}
    if body.decision == "uphold":
        sale = db.get(models.Sale, d.sale_id)
        detail = ledger.refund_sale(db, sale)
        db.get(models.Asset, sale.asset_id).status = "removed"  # never sold again
        d.status = "upheld"
    else:
        d.status = "rejected"
    d.resolution, d.resolved_by, d.resolved_at = body.note.strip(), user.id, datetime.now(timezone.utc)
    audit(db, user, f"dispute.{d.status}", f"dispute:{d.id}", detail | {"note": d.resolution}, request)
    db.commit()
    return {"id": d.id, "status": d.status, **detail}


# ---------- people ----------


@router.get("/api/admin/users")
def users(role: str = "creator", db: DBSession = Depends(get_db), user: models.User = Depends(admin_only)):
    out = []
    for u in db.query(models.User).filter_by(role=role).order_by(models.User.id.desc()).limit(500):
        row = user_out(db, u) | {"created_at": iso(u.created_at),
                                 "deletion_requested_at": iso(u.deletion_requested_at)}
        if role == "creator":
            stats = quality.creator_stats(db, u)
            level = quality.level_of(stats)
            row |= {"approved": stats["approved"], "a_rate": stats["a_rate"], "buyers": stats["buyers"],
                    "level": level, "level_label": LEVELS[level]["label"]}
        out.append(row)
    return out


@router.post("/api/admin/users/{user_id}/verify-industry")
def verify_industry(user_id: int, request: Request, db: DBSession = Depends(get_db), admin: models.User = Depends(admin_only)):
    u = db.get(models.User, user_id)
    if not u or u.role != "creator" or not u.industry:
        raise HTTPException(404, "業界を申告したクリエイターが見つかりません")
    u.industry_verified = True
    audit(db, admin, "user.verify_industry", f"user:{u.id}", {"industry": u.industry}, request)
    db.commit()
    return user_out(db, u)


@router.post("/api/admin/users/{user_id}/suspend")
def suspend(user_id: int, body: SuspendIn, request: Request, db: DBSession = Depends(get_db),
            admin: models.User = Depends(admin_only)):
    u = db.get(models.User, user_id)
    if not u or u.role != "creator":
        raise HTTPException(404, "クリエイターが見つかりません")
    u.suspended = body.suspended
    audit(db, admin, "user.suspend" if body.suspended else "user.unsuspend", f"user:{u.id}", request=request)
    db.commit()
    return user_out(db, u)


@router.get("/api/admin/leaderboard")
def leaderboard(category: str = "ja_voice", industry: str = "", db: DBSession = Depends(get_db),
                user: models.User = Depends(admin_only)):
    """Ranking inside a category (and optionally inside one verified industry). Staff only for now."""
    if category not in CATEGORIES or industry not in INDUSTRIES:
        raise HTTPException(400, "条件が正しくありません")
    sc = quality.scores(db, category)
    rows = []
    for cid, (score, n) in sc.items():
        u = db.get(models.User, cid)
        if industry and not (u.industry == industry and u.industry_verified):
            continue
        rows.append({"id": u.id, "name": u.name, "industry_label": INDUSTRIES[u.industry]["label"] if u.industry else "",
                     "score": round(score, 3), "reviewed": n, "ranked": n >= quality.MIN_REVIEWS_FOR_RANK})
    rows.sort(key=lambda r: (not r["ranked"], -r["score"]))
    return rows[:50]


@router.get("/api/admin/waitlist")
def waitlist(db: DBSession = Depends(get_db), user: models.User = Depends(admin_only)):
    return [{"email": w.email, "role": w.role, "note": w.note, "at": iso(w.created_at)}
            for w in db.query(models.Waitlist).order_by(models.Waitlist.id.desc()).limit(500)]


@router.get("/api/admin/audit")
def audit_log(db: DBSession = Depends(get_db), user: models.User = Depends(admin_only)):
    rows = db.query(models.AuditLog).order_by(models.AuditLog.id.desc()).limit(200).all()
    names = {u.id: u.email for u in db.query(models.User).filter(models.User.id.in_({r.actor_id for r in rows if r.actor_id}))}
    return [{"id": r.id, "at": iso(r.created_at), "actor": names.get(r.actor_id, "—"), "action": r.action,
             "target": r.target, "ip": r.ip} for r in rows]
