"""Create demo accounts (and, with --sample, demo data) for local testing. Never run this against production.

    python seed_demo.py            # staff accounts only
    python seed_demo.py --sample   # plus buyers, creators, orders, sales and a complaint

Every demo account uses the password: seri-demo-pass
"""

import io
import math
import struct
import sys
import uuid
import wave
from datetime import datetime, timedelta, timezone

from app import ledger, models, quality
from app.config import CONSENT_VERSION
from app.db import Base, SessionLocal, engine
from app.pricing import quote
from app.routes_auth import CONSENT_SHA
from app.security import hash_password
from app.storage import storage
from app.views import catalog_price

PASSWORD = "seri-demo-pass"
STAFF = [("admin@seri.example.com", "管理者", "admin"), ("reviewer@seri.example.com", "審査担当", "reviewer")]


def user(db, email, name, role, **extra):
    u = db.query(models.User).filter_by(email=email).first()
    if u:
        return u
    u = models.User(email=email, name=name, role=role, password_hash=hash_password(PASSWORD), **extra)
    db.add(u)
    db.flush()
    if role == "creator":
        db.add(models.Consent(user_id=u.id, version=CONSENT_VERSION, text_sha256=CONSENT_SHA))
        db.flush()
    print(f"  {role:8} {email}")
    return u


def tone(seconds=8.0, freq=180.0, rate=16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(7000 * math.sin(2 * math.pi * freq * i / rate)
                                                     * (0.6 + 0.4 * math.sin(2 * math.pi * 2 * i / rate))))
                               for i in range(int(seconds * rate))))
    return buf.getvalue()


def order(db, buyer, admin_paid=True, instructions="", **kw):
    q = quote(**{"category": "ja_voice", "tier": "any", **kw})
    o = models.Order(buyer_id=buyer.id, category=q["category"], units=q["units"], unit_price_jpy=q["unit_price_jpy"],
                     tier=q["tier"], industry=q["industry"], license=q["license"], tier_multiplier=q["tier_multiplier"],
                     industry_multiplier=q["industry_multiplier"], total_jpy=q["total_jpy"], promo_fee_jpy=q["promo_fee_jpy"],
                     fallback=q["fallback"], deadline_days=q["deadline_days"], instructions=instructions)
    db.add(o)
    db.flush()
    if admin_paid:
        ledger.record_payment(db, o)
        o.status = "open"
        o.deadline_at = datetime.now(timezone.utc) + timedelta(days=o.deadline_days)
    return o


def deliver(db, o, creator, key, n, grade="A", reviewer=None):
    """Approved submissions for an order, paid out like a real review."""
    now = datetime.now(timezone.utc)
    consent = db.query(models.Consent).filter_by(user_id=creator.id).first()
    for _ in range(n):
        sub = models.Submission(order_id=o.id, creator_id=creator.id, file_key=key, sha256=uuid.uuid4().hex * 2,
                                checks={"ok": True, "reasons": [], "metrics": {"duration_sec": 8.0, "level_dbfs": -22.0,
                                                                              "clip_ratio": 0.0, "silence_ratio": 0.05}},
                                status="approved", reviewed_by=reviewer.id if reviewer else None, reviewed_at=now)
        db.add(sub)
        db.flush()
        a = models.Asset(submission_id=sub.id, creator_id=creator.id, category=o.category, sha256=sub.sha256,
                         consent_id=consent.id, grade=grade, duration_sec=8.0,
                         exclusive_until=quality.exclusive_until(o.license, now))
        db.add(a)
        db.flush()
        ledger.settle(db, o, a, ledger.next_unit_amount(db, o), "task")
    if ledger.units_left(db, o) <= 0:
        o.status = "filled"


def sample(db):
    admin = db.query(models.User).filter_by(role="admin").first()
    reviewer = db.query(models.User).filter_by(role="reviewer").first()
    print("sample accounts:")
    acme = user(db, "buyer@seri.example.com", "山田", "buyer", org="Acme音声AI")
    lab = user(db, "lab@seri.example.com", "Chen", "buyer", org="Tokyo LLM Lab")
    hanako = user(db, "hanako@seri.example.com", "花子", "creator", industry="nurse", industry_verified=True)
    taro = user(db, "taro@seri.example.com", "太郎", "creator")
    others = [user(db, f"creator{i}@seri.example.com", f"クリエイター{i}", "creator") for i in range(1, 7)]

    key = storage.put(tone())
    # history: a big finished order that made Hanako a "regular" (royalties on)
    big = order(db, lab, units=500, unit_price_jpy=300, instructions="日常会話を自然な話し言葉で")
    deliver(db, big, hanako, key, 100, "A", reviewer)
    for i, c in enumerate(others):
        deliver(db, big, c, key, 20 + i * 10, "B" if i % 2 else "A", reviewer)
    # Taro has just started
    starter = order(db, acme, units=50, unit_price_jpy=200, instructions="好きな食べ物について30秒話してください")
    deliver(db, starter, taro, key, 3, "B", reviewer)

    # open work for creators to see
    order(db, acme, units=200, unit_price_jpy=400, promoted=True, fallback="downgrade",
          instructions="週末の過ごし方について、自然な話し言葉で30秒〜1分話してください")
    order(db, acme, units=100, unit_price_jpy=600, industry="nurse", tier="top25",
          instructions="夜勤の申し送りを、実際の場面のように話してください（個人名は出さないでください）")
    order(db, lab, units=100, unit_price_jpy=500, category="en_voice", instructions="Describe your hometown in English")
    order(db, lab, units=20, unit_price_jpy=3000, license="buyout", instructions="社名を入れたウェイクワードを10回")
    order(db, acme, admin_paid=False, units=300, unit_price_jpy=300, instructions="電話の問い合わせ対応を再現してください")

    # a catalog resale: royalties to Hanako
    now = datetime.now(timezone.utc)
    picks = [a for a in db.query(models.Asset).filter_by(creator_id=hanako.id).limit(10)
             if quality.catalog_eligible(db, a, now)]
    cat = models.Order(buyer_id=acme.id, kind="catalog", category="ja_voice", units=len(picks),
                       unit_price_jpy=225, tier="any", industry="", license="standard", tier_multiplier=1.0,
                       industry_multiplier=1.0, total_jpy=sum(catalog_price(a) for a in picks), fallback="refund",
                       deadline_days=0)
    db.add(cat)
    db.flush()
    ledger.record_payment(db, cat)
    for a in picks:
        db.add(models.OrderItem(order_id=cat.id, asset_id=a.id, price_jpy=catalog_price(a), status="sold"))
        ledger.settle(db, cat, a, catalog_price(a), "royalty")
    cat.status = "filled"

    # a complaint waiting for the admin
    sale = db.query(models.Sale).filter_by(order_id=starter.id).first()
    db.add(models.Dispute(sale_id=sale.id, buyer_id=acme.id, reason="途中から雑音が大きく、聞き取れない部分があります"))
    db.add(models.Waitlist(email="nurse.friend@example.com", role="creator", note=""))
    db.add(models.Waitlist(email="data@voice-startup.example.com", role="buyer", note="関西弁の会話 30時間"))


def main():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    print("staff accounts:")
    for email, name, role in STAFF:
        user(db, email, name, role)
    if "--sample" in sys.argv and not db.query(models.Order).first():
        sample(db)
    assert ledger.check_integrity(db)["balanced"]
    db.commit()
    db.close()
    print(f"password for every demo account: {PASSWORD}")


if __name__ == "__main__":
    main()
