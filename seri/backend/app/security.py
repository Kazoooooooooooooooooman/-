"""Passwords, sessions, roles, audit log and request hardening."""

import hashlib
import hmac
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session as DBSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from . import models
from .config import COOKIE_SECURE, SESSION_HOURS
from .db import get_db

COOKIE = "seri_session"
CSRF_HEADER = "x-seri-csrf"

# ---------- passwords (scrypt, per-user salt) ----------


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt$16384$8$1${salt.hex()}${key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, key = stored.split("$")
        got = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(got.hex(), key)
    except (ValueError, TypeError):
        return False


def check_password_strength(password: str):
    if len(password) < 10:
        raise HTTPException(400, "パスワードは10文字以上にしてください")


# ---------- login throttling (per email, in memory) ----------

_failures: dict[str, list[float]] = defaultdict(list)
MAX_FAILURES, WINDOW_S = 5, 15 * 60


def throttle_check(email: str):
    recent = [t for t in _failures[email] if time.time() - t < WINDOW_S]
    _failures[email] = recent
    if len(recent) >= MAX_FAILURES:
        raise HTTPException(429, "ログインの失敗が続いています。15分後にもう一度お試しください")


def throttle_fail(email: str):
    _failures[email].append(time.time())


def throttle_reset(email: str):
    _failures.pop(email, None)


# ---------- sessions ----------


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: DBSession, user: models.User, response):
    token = secrets.token_urlsafe(32)
    db.add(models.Session(token_hash=_token_hash(token), user_id=user.id,
                          expires_at=datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)))
    db.commit()
    response.set_cookie(COOKIE, token, httponly=True, secure=COOKIE_SECURE, samesite="lax",
                        max_age=SESSION_HOURS * 3600, path="/")


def end_session(db: DBSession, request: Request, response):
    token = request.cookies.get(COOKIE)
    if token:
        db.query(models.Session).filter_by(token_hash=_token_hash(token)).delete()
        db.commit()
    response.delete_cookie(COOKIE, path="/")


def current_user(request: Request, db: DBSession = Depends(get_db)) -> models.User:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "ログインしてください")
    s = db.get(models.Session, _token_hash(token))
    if not s:
        raise HTTPException(401, "ログインしてください")
    expires = s.expires_at if s.expires_at.tzinfo else s.expires_at.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        db.delete(s)
        db.commit()
        raise HTTPException(401, "ログインの有効期限が切れました")
    user = db.get(models.User, s.user_id)
    if not user:
        raise HTTPException(401, "ログインしてください")
    return user


def require_role(*roles: str):
    def dep(user: models.User = Depends(current_user)) -> models.User:
        if user.role not in roles:
            raise HTTPException(403, "この操作をする権限がありません")
        return user

    return dep


# ---------- audit log ----------


def audit(db: DBSession, actor, action: str, target: str = "", detail: dict | None = None, request: Request | None = None):
    db.add(models.AuditLog(actor_id=getattr(actor, "id", None), action=action, target=target,
                           detail=detail or {}, ip=(request.client.host if request and request.client else "")))


# ---------- middleware ----------


class SecurityMiddleware(BaseHTTPMiddleware):
    """Security headers on every response, and a CSRF guard on state-changing API calls.

    Browsers only send the custom header from our own pages: a cross-site form or script
    cannot add it without a CORS preflight, which this API never allows.
    """

    async def dispatch(self, request, call_next):
        if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
            if request.headers.get(CSRF_HEADER) != "1":
                return JSONResponse({"detail": "不正なリクエストです"}, status_code=403)
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "microphone=(self), camera=(), geolocation=()"
        response.headers["X-Frame-Options"] = "DENY"
        if COOKIE_SECURE:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response
