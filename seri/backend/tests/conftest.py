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


@pytest.fixture
def fresh_email():
    counter = {"n": 0}

    def make(prefix="u"):
        counter["n"] += 1
        return f"{prefix}{counter['n']}-{os.urandom(3).hex()}@example.com"

    return make
