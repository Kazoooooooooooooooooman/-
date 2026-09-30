import io
import math
import os
import struct
import sys
import tempfile
import wave
from pathlib import Path

import pytest

_tmp = tempfile.mkdtemp(prefix="seri-test-")
os.environ["SERI_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["SERI_STORAGE_DIR"] = f"{_tmp}/uploads"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app import models  # noqa: E402
from app.security import hash_password  # noqa: E402

H = {"X-Seri-CSRF": "1"}


def make_wav(seconds=6.0, freq=220.0, amp=8000, rate=16000, silent=False) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        n = int(seconds * rate)
        frames = b"".join(
            struct.pack("<h", 0 if silent else int(amp * math.sin(2 * math.pi * freq * i / rate) + (i % 7)))
            for i in range(n)
        )
        w.writeframes(frames)
    return buf.getvalue()


def client():
    return TestClient(app, base_url="http://testserver")


def signup(c, email, role, **extra):
    meta = c.get("/api/meta").json()
    body = {"email": email, "password": "correct-horse-1", "name": email.split("@")[0], "role": role,
            "consent_version": meta["consent"]["version"], **extra}
    r = c.post("/api/auth/signup", json=body, headers=H)
    assert r.status_code == 201, r.text
    return r.json()


def make_staff(email, role):
    db = SessionLocal()
    u = models.User(email=email, name=role, role=role, password_hash=hash_password("correct-horse-1"))
    db.add(u)
    db.commit()
    db.close()
    c = client()
    assert c.post("/api/auth/login", json={"email": email, "password": "correct-horse-1"}, headers=H).status_code == 200
    return c


def give_assets(creator_id: int, n: int, grade: str = "A", category: str = "ja_voice", license: str = "standard") -> list[int]:
    """Insert n approved assets for a creator straight into the database (fast way to reach a level)."""
    import uuid

    from app.quality import exclusive_until
    from app.storage import storage
    from datetime import datetime, timezone

    db = SessionLocal()
    buyer = models.User(email=f"seed-{uuid.uuid4().hex[:8]}@example.com", name="seed", role="buyer", org="Seed Co",
                        password_hash="x")
    db.add(buyer)
    db.flush()
    o = models.Order(buyer_id=buyer.id, category=category, units=n, unit_price_jpy=100, tier="any", license=license,
                     tier_multiplier=1.0, industry_multiplier=1.0, total_jpy=100 * n, status="filled")
    db.add(o)
    db.flush()
    consent = db.query(models.Consent).filter_by(user_id=creator_id).first()
    key = storage.put(make_wav(seconds=6))
    ids = []
    for _ in range(n):
        sub = models.Submission(order_id=o.id, creator_id=creator_id, file_key=key, sha256=uuid.uuid4().hex * 2,
                                checks={"ok": True, "metrics": {"duration_sec": 6.0}}, status="approved")
        db.add(sub)
        db.flush()
        a = models.Asset(submission_id=sub.id, creator_id=creator_id, category=category, sha256=sub.sha256,
                         consent_id=consent.id, grade=grade, duration_sec=6.0,
                         exclusive_until=exclusive_until(license, datetime.now(timezone.utc)))
        db.add(a)
        db.flush()
        ids.append(a.id)
    db.commit()
    db.close()
    return ids


def paid_order(buyer, admin, **body) -> dict:
    o = buyer.post("/api/orders", json={"category": "ja_voice", "units": 2, "unit_price_jpy": 500, "tier": "any", **body},
                   headers=H)
    assert o.status_code == 201, o.text
    r = admin.post(f"/api/admin/orders/{o.json()['id']}/mark-paid", headers=H)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    from app import security

    security._hits.clear()
    yield


@pytest.fixture
def fresh_email():
    counter = {"n": 0}

    def make(prefix="u"):
        counter["n"] += 1
        return f"{prefix}{counter['n']}-{os.urandom(3).hex()}@example.com"

    return make
