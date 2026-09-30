"""Seri API + web app.

Run:  uvicorn app.main:app --reload   (from seri/backend)
"""

import hashlib
import math
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session as DBSession

from . import ledger, models, quality
from .config import (CATEGORIES, CONSENT_TEXT, CONSENT_VERSION, INDUSTRIES, LICENSES, MAX_CLIP_RATIO, MAX_SILENCE_RATIO,
                     MAX_UPLOAD_BYTES, MIN_LEVEL_DBFS, TIERS)
from .db import Base, engine, get_db
from .pricing import quote
from .security import (SecurityMiddleware, audit, check_password_strength, current_user, end_session,
                       hash_password, require_role, start_session, throttle_check, throttle_fail,
                       throttle_reset, verify_password)
from .storage import storage

ORDER_CAP_PCT = 20  # one creator may fill at most 20% of an order, so earnings spread across people

Base.metadata.create_all(engine)
app = FastAPI(title="Seri", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(SecurityMiddleware)

WEB_DIR = Path(__file__).resolve().parents[2] / "web"
CONSENT_SHA = hashlib.sha256(CONSENT_TEXT.encode()).hexdigest()


# ---------- schemas ----------


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


class OrderIn(QuoteIn):
    instructions: str = Field(default="", max_length=2000)


class ReviewIn(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    reason: str = Field(default="", max_length=500)


def user_out(u: models.User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "org": u.org,
            "industry": u.industry, "industry_verified": u.industry_verified}


# ---------- public ----------


@app.get("/api/meta")
def meta():
    return {"categories": CATEGORIES, "tiers": TIERS, "industries": INDUSTRIES, "licenses": LICENSES,
            "consent": {"version": CONSENT_VERSION, "text": CONSENT_TEXT},
            # the recorder pre-checks against the same limits the server enforces
            "audio": {"min_level_dbfs": MIN_LEVEL_DBFS, "max_clip_ratio": MAX_CLIP_RATIO, "max_silence_ratio": MAX_SILENCE_RATIO}}


@app.post("/api/quote")
def api_quote(body: QuoteIn):
    return quote(**body.model_dump())


@app.post("/api/waitlist", status_code=201)
def join_waitlist(body: WaitlistIn, request: Request, db: DBSession = Depends(get_db)):
    db.add(models.Waitlist(email=body.email.lower(), role=body.role, note=body.note))
    audit(db, None, "waitlist.join", body.role, request=request)
    db.commit()
    return {"ok": True}


# ---------- auth ----------


@app.post("/api/auth/signup", status_code=201)
def signup(body: SignupIn, request: Request, response: Response, db: DBSession = Depends(get_db)):
    email = body.email.lower()
    check_password_strength(body.password)
    if body.industry not in INDUSTRIES:
        raise HTTPException(400, "業界が正しくありません")
    if body.role == "creator" and body.consent_version != CONSENT_VERSION:
        raise HTTPException(400, "同意書に同意してください")
    if db.query(models.User).filter_by(email=email).first():
        raise HTTPException(409, "このメールアドレスはすでに登録されています")
    u = models.User(email=email, name=body.name, role=body.role, org=body.org,
                    industry=body.industry if body.role == "creator" else "",
                    password_hash=hash_password(body.password))
    db.add(u)
    db.flush()
    if body.role == "creator":
        db.add(models.Consent(user_id=u.id, version=CONSENT_VERSION, text_sha256=CONSENT_SHA))
    audit(db, u, "user.signup", f"user:{u.id}", {"role": u.role}, request)
    db.commit()
    start_session(db, u, response)
    return user_out(u)


@app.post("/api/auth/login")
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
    return user_out(u)


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, db: DBSession = Depends(get_db)):
    end_session(db, request, response)
    return {"ok": True}


@app.get("/api/me")
def me(user: models.User = Depends(current_user)):
    return user_out(user)


# ---------- buyers ----------


def order_out(db: DBSession, o: models.Order) -> dict:
    approved = db.query(models.Submission).filter_by(order_id=o.id, status="approved").count()
    return {"id": o.id, "category": o.category, "category_label": CATEGORIES[o.category]["label"],
            "units": o.units, "unit_price_jpy": o.unit_price_jpy, "tier": o.tier, "tier_label": TIERS[o.tier]["label"],
            "industry": o.industry, "industry_label": INDUSTRIES[o.industry]["label"], "license": o.license,
            "license_label": LICENSES[o.license], "total_jpy": o.total_jpy, "status": o.status,
            "instructions": o.instructions, "approved": approved, "created_at": o.created_at.isoformat()}


@app.post("/api/orders", status_code=201)
def create_order(body: OrderIn, request: Request, db: DBSession = Depends(get_db),
                 user: models.User = Depends(require_role("buyer"))):
    q = quote(**body.model_dump(exclude={"instructions"}))
    o = models.Order(buyer_id=user.id, category=q["category"], instructions=body.instructions, units=q["units"],
                     unit_price_jpy=q["unit_price_jpy"], tier=q["tier"], industry=q["industry"], license=q["license"],
                     tier_multiplier=q["tier_multiplier"], industry_multiplier=q["industry_multiplier"],
                     total_jpy=q["total_jpy"])
    db.add(o)
    db.flush()
    audit(db, user, "order.create", f"order:{o.id}", {"total_jpy": o.total_jpy}, request)
    db.commit()
    return order_out(db, o)


@app.get("/api/orders/mine")
def my_orders(db: DBSession = Depends(get_db), user: models.User = Depends(require_role("buyer"))):
    orders = db.query(models.Order).filter_by(buyer_id=user.id).order_by(models.Order.id.desc()).all()
    return [order_out(db, o) for o in orders]


def _own_order(db: DBSession, order_id: int, user: models.User) -> models.Order:
    o = db.get(models.Order, order_id)
    if not o or o.buyer_id != user.id:
        raise HTTPException(404, "注文が見つかりません")
    return o


@app.get("/api/orders/{order_id}/datacard")
def datacard(order_id: int, db: DBSession = Depends(get_db), user: models.User = Depends(require_role("buyer"))):
    """Machine-readable summary of what was delivered, for the buyer's people and agents."""
    o = _own_order(db, order_id, user)
    rows = (db.query(models.Sale, models.Asset, models.Submission)
            .join(models.Asset, models.Asset.id == models.Sale.asset_id)
            .join(models.Submission, models.Submission.id == models.Asset.submission_id)
            .filter(models.Sale.order_id == o.id).all())
    durations = [s.checks.get("metrics", {}).get("duration_sec", 0) for _, _, s in rows]
    return {
        "schema": "seri.datacard.v1",
        "order_id": o.id,
        "category": o.category,
        "license": o.license,
        "items": len(rows),
        "creators": len({a.creator_id for _, a, _ in rows}),
        "total_duration_sec": round(sum(durations), 2),
        "tier": o.tier,
        "industry": o.industry or None,
        "verification": {"automatic_checks": True, "human_review": "every item", "consent_version": CONSENT_VERSION},
        "assets": [{"asset_id": a.id, "sha256": a.sha256, "duration_sec": s.checks.get("metrics", {}).get("duration_sec"),
                    "download": f"/api/assets/{a.id}/download"} for _, a, s in rows],
    }


@app.get("/api/assets/{asset_id}/download")
def download_asset(asset_id: int, request: Request, db: DBSession = Depends(get_db),
                   user: models.User = Depends(require_role("buyer"))):
    sale = db.query(models.Sale).filter_by(asset_id=asset_id, buyer_id=user.id).first()
    if not sale:
        raise HTTPException(404, "データが見つかりません")
    asset = db.get(models.Asset, asset_id)
    sub = db.get(models.Submission, asset.submission_id)
    audit(db, user, "asset.download", f"asset:{asset_id}", request=request)
    db.commit()
    return FileResponse(storage.path(sub.file_key), media_type="audio/wav", filename=f"seri-{asset_id}.wav")


# ---------- creators ----------


def _slots_left(db: DBSession, o: models.Order) -> int:
    used = db.query(models.Submission).filter(models.Submission.order_id == o.id,
                                              models.Submission.status.in_(["pending", "approved"])).count()
    return o.units - used


def _creator_cap(o: models.Order) -> int:
    return max(1, math.ceil(o.units * ORDER_CAP_PCT / 100))


@app.get("/api/tasks")
def tasks(db: DBSession = Depends(get_db), user: models.User = Depends(require_role("creator"))):
    out = []
    for o in db.query(models.Order).filter_by(status="open").order_by(models.Order.id.desc()).all():
        if not quality.can_take(db, user, o) or _slots_left(db, o) <= 0:
            continue
        mine = db.query(models.Submission).filter(models.Submission.order_id == o.id,
                                                  models.Submission.creator_id == user.id,
                                                  models.Submission.status.in_(["pending", "approved"])).count()
        if mine >= _creator_cap(o):
            continue
        per_unit = o.total_jpy // o.units
        d = order_out(db, o)
        d["you_earn_jpy"] = per_unit * 90 // 100
        d["your_remaining"] = _creator_cap(o) - mine
        out.append(d)
    return out


@app.post("/api/tasks/{order_id}/submissions", status_code=201)
async def submit(order_id: int, request: Request, file: UploadFile = File(...), db: DBSession = Depends(get_db),
                 user: models.User = Depends(require_role("creator"))):
    o = db.get(models.Order, order_id)
    if not o or o.status != "open" or not quality.can_take(db, user, o):
        raise HTTPException(404, "この仕事は受けられません")
    if _slots_left(db, o) <= 0:
        raise HTTPException(409, "この仕事はすでに埋まりました")
    mine = db.query(models.Submission).filter(models.Submission.order_id == o.id, models.Submission.creator_id == user.id,
                                              models.Submission.status.in_(["pending", "approved"])).count()
    if mine >= _creator_cap(o):
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


@app.get("/api/submissions/mine")
def my_submissions(db: DBSession = Depends(get_db), user: models.User = Depends(require_role("creator"))):
    subs = db.query(models.Submission).filter_by(creator_id=user.id).order_by(models.Submission.id.desc()).limit(100)
    return [{"id": s.id, "order_id": s.order_id, "status": s.status, "reason": s.reason,
             "duration_sec": s.checks.get("metrics", {}).get("duration_sec"), "created_at": s.created_at.isoformat()}
            for s in subs]


@app.get("/api/earnings")
def earnings(db: DBSession = Depends(get_db), user: models.User = Depends(require_role("creator"))):
    sales = (db.query(models.Sale, models.Order, models.User)
             .join(models.Asset, models.Asset.id == models.Sale.asset_id)
             .join(models.Order, models.Order.id == models.Sale.order_id)
             .join(models.User, models.User.id == models.Sale.buyer_id)
             .filter(models.Asset.creator_id == user.id).order_by(models.Sale.id.desc()).limit(100).all())
    return {
        "available_jpy": -ledger.balance(db, f"creator:{user.id}:available"),
        "held_jpy": -ledger.balance(db, f"creator:{user.id}:held"),
        "sales": [{"sale_id": s.id, "buyer": b.org or "非公開", "category": CATEGORIES[o.category]["label"],
                   "license": LICENSES[s.license], "price_jpy": s.amount_jpy, "you_jpy": s.creator_jpy,
                   "at": s.created_at.isoformat()} for s, o, b in sales],
    }


# ---------- reviewers ----------


@app.get("/api/review/queue")
def review_queue(db: DBSession = Depends(get_db), user: models.User = Depends(require_role("reviewer", "admin"))):
    subs = db.query(models.Submission).filter_by(status="pending").order_by(models.Submission.id).limit(50).all()
    out = []
    for s in subs:
        o = db.get(models.Order, s.order_id)
        out.append({"id": s.id, "order_id": o.id, "category": CATEGORIES[o.category]["label"],
                    "instructions": o.instructions, "checks": s.checks, "created_at": s.created_at.isoformat()})
    return out


@app.get("/api/review/{submission_id}/audio")
def review_audio(submission_id: int, request: Request, db: DBSession = Depends(get_db),
                 user: models.User = Depends(require_role("reviewer", "admin"))):
    s = db.get(models.Submission, submission_id)
    if not s:
        raise HTTPException(404, "見つかりません")
    audit(db, user, "submission.listen", f"submission:{s.id}", request=request)
    db.commit()
    return FileResponse(storage.path(s.file_key), media_type="audio/wav")


@app.post("/api/review/{submission_id}")
def review(submission_id: int, body: ReviewIn, request: Request, db: DBSession = Depends(get_db),
           user: models.User = Depends(require_role("reviewer", "admin"))):
    s = db.get(models.Submission, submission_id)
    if not s or s.status != "pending":
        raise HTTPException(404, "審査待ちの提出が見つかりません")
    if s.creator_id == user.id:
        raise HTTPException(403, "自分の提出は審査できません")
    o = db.get(models.Order, s.order_id)
    s.reviewed_by, s.reviewed_at = user.id, datetime.now(timezone.utc)
    if body.decision == "reject":
        if not body.reason.strip():
            raise HTTPException(400, "不合格の理由を書いてください（クリエイターに届きます）")
        s.status, s.reason = "rejected", body.reason.strip()
    else:
        consent = (db.query(models.Consent).filter_by(user_id=s.creator_id).order_by(models.Consent.id.desc()).first())
        s.status = "approved"
        asset = models.Asset(submission_id=s.id, creator_id=s.creator_id, category=o.category, sha256=s.sha256,
                             consent_id=consent.id)
        db.add(asset)
        db.flush()
        index = db.query(models.Sale).filter_by(order_id=o.id).count()
        ledger.settle_unit(db, o, asset, index)
        if index + 1 >= o.units:
            o.status = "filled"
    audit(db, user, f"submission.{body.decision}", f"submission:{s.id}", {"reason": s.reason}, request)
    db.commit()
    return {"id": s.id, "status": s.status}


# ---------- admin ----------


@app.post("/api/admin/orders/{order_id}/mark-paid")
def mark_paid(order_id: int, request: Request, db: DBSession = Depends(get_db),
              user: models.User = Depends(require_role("admin"))):
    o = db.get(models.Order, order_id)
    if not o or o.status != "awaiting_payment":
        raise HTTPException(404, "入金待ちの注文が見つかりません")
    ledger.record_payment(db, o)
    o.status = "open"
    audit(db, user, "order.paid", f"order:{o.id}", {"total_jpy": o.total_jpy}, request)
    db.commit()
    return order_out(db, o)


@app.get("/api/admin/orders")
def all_orders(db: DBSession = Depends(get_db), user: models.User = Depends(require_role("admin"))):
    return [order_out(db, o) for o in db.query(models.Order).order_by(models.Order.id.desc()).limit(200)]


@app.post("/api/admin/users/{user_id}/verify-industry")
def verify_industry(user_id: int, request: Request, db: DBSession = Depends(get_db),
                    admin: models.User = Depends(require_role("admin"))):
    u = db.get(models.User, user_id)
    if not u or u.role != "creator" or not u.industry:
        raise HTTPException(404, "業界を申告したクリエイターが見つかりません")
    u.industry_verified = True
    audit(db, admin, "user.verify_industry", f"user:{u.id}", {"industry": u.industry}, request)
    db.commit()
    return user_out(u)


@app.post("/api/admin/release-holds")
def release_holds(request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(require_role("admin"))):
    n = ledger.release_due_holds(db)
    audit(db, user, "ledger.release_holds", "", {"released": n}, request)
    db.commit()
    return {"released": n}


@app.get("/api/admin/ledger/check")
def ledger_check(db: DBSession = Depends(get_db), user: models.User = Depends(require_role("admin"))):
    return ledger.check_integrity(db)


@app.get("/api/admin/waitlist")
def waitlist(db: DBSession = Depends(get_db), user: models.User = Depends(require_role("admin"))):
    return [{"email": w.email, "role": w.role, "note": w.note, "at": w.created_at.isoformat()}
            for w in db.query(models.Waitlist).order_by(models.Waitlist.id.desc()).limit(500)]


# ---------- web app ----------

app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
