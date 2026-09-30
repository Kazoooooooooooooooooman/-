"""Public endpoints, sign-in, and the signed-in person's own account."""

import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from . import models
from .config import (CATEGORIES, CONSENT_TEXT, CONSENT_VERSION, FALLBACKS, GOALS_JPY, GRADES, HOLD_DAYS, INDUSTRIES,
                     LEVELS, LICENSES, MAX_CLIP_RATIO, MAX_SILENCE_RATIO, MIN_LEVEL_DBFS, PROMO_FEE_JPY, TIERS)
from .db import get_db
from .pricing import quote
from .security import (audit, check_password_strength, client_ip, current_user, end_all_sessions, end_session,
                       hash_password, rate_limit, require_role, start_session, throttle_check, throttle_fail,
                       throttle_reset, verify_password)
from .views import iso, success_stats, user_out

router = APIRouter()
CONSENT_SHA = hashlib.sha256(CONSENT_TEXT.encode()).hexdigest()


class WaitlistIn(BaseModel):
    email: EmailStr
    role: str = Field(pattern="^(creator|buyer)$")
    note: str = Field(default="", max_length=500)


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)
    name: str = Field(min_length=1, max_length=100)
    role: str = Field(pattern="^(creator|buyer)$")
    org: str = Field(default="", max_length=200)
    industry: str = Field(default="", max_length=40)
    consent_version: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class QuoteIn(BaseModel):
    category: str
    units: int
    unit_price_jpy: int
    tier: str = "any"
    industry: str = ""
    license: str = "standard"
    fallback: str = "extend"
    promoted: bool = False


class PasswordIn(BaseModel):
    current: str = Field(max_length=200)
    new: str = Field(max_length=200)


class SettingsIn(BaseModel):
    accept_buyout: bool


class ConsentIn(BaseModel):
    version: str


# ---------- public ----------


@router.get("/api/meta")
def meta():
    return {"categories": CATEGORIES, "tiers": TIERS, "industries": INDUSTRIES, "licenses": LICENSES,
            "grades": GRADES, "levels": LEVELS, "goals": [{"jpy": j, "label": lb} for j, lb in GOALS_JPY],
            "fallbacks": FALLBACKS, "promo_fee_jpy": PROMO_FEE_JPY, "hold_days": HOLD_DAYS,
            "consent": {"version": CONSENT_VERSION, "text": CONSENT_TEXT},
            # the recorder pre-checks against the same limits the server enforces
            "audio": {"min_level_dbfs": MIN_LEVEL_DBFS, "max_clip_ratio": MAX_CLIP_RATIO, "max_silence_ratio": MAX_SILENCE_RATIO}}


@router.post("/api/quote")
def api_quote(body: QuoteIn):
    return quote(**body.model_dump())


@router.get("/api/public/stats")
def public_stats(db: DBSession = Depends(get_db)):
    """Numbers we promise to publish. The success rate appears only once enough people are active to mean anything."""
    creators = db.query(models.User).filter_by(role="creator").count()
    paid = db.query(func.coalesce(func.sum(models.Sale.creator_jpy), 0)).filter(models.Sale.refunded.is_(False)).scalar()
    s = success_stats(db)
    return {"creators": creators, "paid_to_creators_jpy": paid, "success": s if s["active"] >= 10 else None}


@router.post("/api/waitlist", status_code=201)
def join_waitlist(body: WaitlistIn, request: Request, db: DBSession = Depends(get_db)):
    rate_limit(f"waitlist:{client_ip(request)}", 10, 3600)
    db.add(models.Waitlist(email=body.email.lower(), role=body.role, note=body.note))
    audit(db, None, "waitlist.join", body.role, request=request)
    db.commit()
    return {"ok": True}


# ---------- auth ----------


@router.post("/api/auth/signup", status_code=201)
def signup(body: SignupIn, request: Request, response: Response, db: DBSession = Depends(get_db)):
    rate_limit(f"signup:{client_ip(request)}", 20, 3600)
    email = body.email.lower()
    check_password_strength(body.password)
    if body.industry not in INDUSTRIES:
        raise HTTPException(400, "業界が正しくありません")
    if body.role == "creator" and body.consent_version != CONSENT_VERSION:
        raise HTTPException(400, "同意書に同意してください")
    if db.query(models.User).filter_by(email=email).first():
        raise HTTPException(409, "このメールアドレスはすでに登録されています")
    u = models.User(email=email, name=body.name, role=body.role, org=body.org if body.role == "buyer" else "",
                    industry=body.industry if body.role == "creator" else "",
                    password_hash=hash_password(body.password))
    db.add(u)
    db.flush()
    if body.role == "creator":
        db.add(models.Consent(user_id=u.id, version=CONSENT_VERSION, text_sha256=CONSENT_SHA))
    audit(db, u, "user.signup", f"user:{u.id}", {"role": u.role}, request)
    db.commit()
    start_session(db, u, response)
    return user_out(db, u)


@router.post("/api/auth/login")
def login(body: LoginIn, request: Request, response: Response, db: DBSession = Depends(get_db)):
    email = body.email.lower()
    throttle_check(email)
    u = db.query(models.User).filter_by(email=email).first()
    if not u or not verify_password(body.password, u.password_hash):
        throttle_fail(email)
        audit(db, None, "user.login_failed", email, request=request)
        db.commit()
        raise HTTPException(401, "メールアドレスかパスワードが違います")
    throttle_reset(email)
    audit(db, u, "user.login", f"user:{u.id}", request=request)
    db.commit()
    start_session(db, u, response)
    return user_out(db, u)


@router.post("/api/auth/logout")
def logout(request: Request, response: Response, db: DBSession = Depends(get_db)):
    end_session(db, request, response)
    return {"ok": True}


# ---------- my account ----------


@router.get("/api/me")
def me(db: DBSession = Depends(get_db), user: models.User = Depends(current_user)):
    return user_out(db, user)


@router.post("/api/account/password")
def change_password(body: PasswordIn, request: Request, response: Response, db: DBSession = Depends(get_db),
                    user: models.User = Depends(current_user)):
    throttle_check(user.email)
    if not verify_password(body.current, user.password_hash):
        throttle_fail(user.email)
        raise HTTPException(400, "今のパスワードが違います")
    check_password_strength(body.new)
    user.password_hash = hash_password(body.new)
    end_all_sessions(db, user)  # sign out every other device
    audit(db, user, "user.password_change", f"user:{user.id}", request=request)
    db.commit()
    start_session(db, user, response)
    return {"ok": True}


@router.post("/api/account/settings")
def settings(body: SettingsIn, request: Request, db: DBSession = Depends(get_db),
             user: models.User = Depends(require_role("creator"))):
    user.accept_buyout = body.accept_buyout
    audit(db, user, "user.settings", f"user:{user.id}", body.model_dump(), request)
    db.commit()
    return user_out(db, user)


@router.get("/api/account/consents")
def my_consents(db: DBSession = Depends(get_db), user: models.User = Depends(current_user)):
    rows = db.query(models.Consent).filter_by(user_id=user.id).order_by(models.Consent.id.desc()).all()
    return {"current": {"version": CONSENT_VERSION, "text": CONSENT_TEXT},
            "accepted": [{"version": c.version, "accepted_at": iso(c.accepted_at), "text_sha256": c.text_sha256,
                          "text": CONSENT_TEXT if c.text_sha256 == CONSENT_SHA else None} for c in rows]}


@router.post("/api/account/consent")
def accept_consent(body: ConsentIn, request: Request, db: DBSession = Depends(get_db),
                   user: models.User = Depends(require_role("creator"))):
    if body.version != CONSENT_VERSION:
        raise HTTPException(400, "最新の同意書を読み込み直してください")
    db.add(models.Consent(user_id=user.id, version=CONSENT_VERSION, text_sha256=CONSENT_SHA))
    audit(db, user, "user.consent", f"user:{user.id}", {"version": CONSENT_VERSION}, request)
    db.commit()
    return user_out(db, user)


@router.get("/api/account/export")
def export(request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(current_user)):
    """Everything Seri holds about this person, as JSON (the right to see your own data)."""
    subs = db.query(models.Submission).filter_by(creator_id=user.id).all()
    assets = db.query(models.Asset).filter_by(creator_id=user.id).all()
    my_sales = (db.query(models.Sale).join(models.Asset, models.Asset.id == models.Sale.asset_id)
                .filter(models.Asset.creator_id == user.id).all())
    orders = db.query(models.Order).filter_by(buyer_id=user.id).all()
    audit(db, user, "user.export", f"user:{user.id}", request=request)
    db.commit()
    return {
        "schema": "seri.export.v1",
        "profile": user_out(db, user) | {"created_at": iso(user.created_at)},
        "consents": my_consents(db, user)["accepted"],
        "submissions": [{"id": s.id, "order_id": s.order_id, "status": s.status, "reason": s.reason,
                         "sha256": s.sha256, "checks": s.checks, "created_at": iso(s.created_at)} for s in subs],
        "assets": [{"id": a.id, "category": a.category, "grade": a.grade, "sha256": a.sha256, "listed": a.listed,
                    "status": a.status, "created_at": iso(a.created_at)} for a in assets],
        "sales_of_my_data": [{"id": s.id, "asset_id": s.asset_id, "license": s.license, "kind": s.kind,
                              "amount_jpy": s.amount_jpy, "you_jpy": s.creator_jpy, "refunded": s.refunded,
                              "at": iso(s.created_at)} for s in my_sales],
        "orders": [{"id": o.id, "kind": o.kind, "total_jpy": o.total_jpy, "status": o.status,
                    "created_at": iso(o.created_at)} for o in orders],
    }


@router.post("/api/account/delete-request")
def delete_request(request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(current_user)):
    """Stops all future sales at once. Staff then delete what the law lets us delete; payment records are kept."""
    if not user.deletion_requested_at:
        user.deletion_requested_at = datetime.now(timezone.utc)
        audit(db, user, "user.delete_request", f"user:{user.id}", request=request)
        db.commit()
    return user_out(db, user)
