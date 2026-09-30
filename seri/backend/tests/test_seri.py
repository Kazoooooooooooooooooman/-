from datetime import datetime, timedelta, timezone

from conftest import H, client, give_assets, make_staff, make_wav, signup

from app import ledger, models
from app.db import SessionLocal
from app.pricing import quote


# ---------- pricing ----------


def test_quote_multipliers():
    assert quote("ja_voice", 1000, 300, "any")["total_jpy"] == 300_000
    assert quote("ja_voice", 1000, 300, "top50")["total_jpy"] == 360_000
    assert quote("ja_voice", 1000, 300, "top25")["total_jpy"] == 450_000
    assert quote("ja_voice", 1000, 300, "top10")["total_jpy"] == 600_000
    assert quote("ja_voice", 1000, 300, "top10", "nurse")["total_jpy"] == 720_000


def test_quote_rejects_price_below_floor():
    c = client()
    r = c.post("/api/quote", json={"category": "ja_voice", "units": 10, "unit_price_jpy": 50, "tier": "any"}, headers=H)
    assert r.status_code == 400


# ---------- security ----------


def test_csrf_header_required():
    c = client()
    r = c.post("/api/quote", json={"category": "ja_voice", "units": 1, "unit_price_jpy": 100})
    assert r.status_code == 403


def test_security_headers():
    r = client().get("/api/meta")
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["x-content-type-options"] == "nosniff"


def test_creator_must_consent(fresh_email):
    c = client()
    body = {"email": fresh_email(), "password": "correct-horse-1", "name": "a", "role": "creator", "consent_version": ""}
    assert c.post("/api/auth/signup", json=body, headers=H).status_code == 400


def test_short_password_refused(fresh_email):
    c = client()
    body = {"email": fresh_email(), "password": "short", "name": "a", "role": "buyer"}
    assert c.post("/api/auth/signup", json=body, headers=H).status_code == 400


def test_login_throttled_after_failures(fresh_email):
    c = client()
    email = fresh_email()
    signup(c, email, "buyer")
    for _ in range(5):
        assert c.post("/api/auth/login", json={"email": email, "password": "wrong-password"}, headers=H).status_code == 401
    assert c.post("/api/auth/login", json={"email": email, "password": "correct-horse-1"}, headers=H).status_code == 429


def test_roles_enforced(fresh_email):
    buyer = client()
    signup(buyer, fresh_email(), "buyer")
    assert buyer.get("/api/review/queue").status_code == 403
    assert buyer.get("/api/tasks").status_code == 403
    assert client().get("/api/me").status_code == 401


# ---------- quality checks ----------


def test_wav_checks():
    from app.quality import check_wav

    assert check_wav(make_wav(), "ja_voice")["ok"]
    short = check_wav(make_wav(seconds=2), "ja_voice")
    assert not short["ok"] and any("短すぎ" in r for r in short["reasons"])
    silent = check_wav(make_wav(silent=True), "ja_voice")
    assert not silent["ok"]
    assert not check_wav(b"not audio", "ja_voice")["ok"]


# ---------- end to end ----------


def test_full_flow(fresh_email):
    buyer, creator, reviewer_c = client(), client(), None
    signup(buyer, fresh_email("buyer"), "buyer", org="Acme AI")
    creator_user = signup(creator, fresh_email("creator"), "creator")
    admin = make_staff(fresh_email("admin"), "admin")
    reviewer_c = make_staff(fresh_email("rev"), "reviewer")

    o = buyer.post("/api/orders", json={"category": "ja_voice", "units": 2, "unit_price_jpy": 333, "tier": "any",
                                        "instructions": "Talk about your weekend"}, headers=H).json()
    assert o["total_jpy"] == 666 and o["status"] == "awaiting_payment"
    assert creator.get("/api/tasks").json() == [] or all(t["id"] != o["id"] for t in creator.get("/api/tasks").json())

    assert admin.post(f"/api/admin/orders/{o['id']}/mark-paid", headers=H).status_code == 200
    tasks = creator.get("/api/tasks").json()
    assert any(t["id"] == o["id"] for t in tasks)

    # a bad recording is refused and never stored
    bad = creator.post(f"/api/tasks/{o['id']}/submissions", files={"file": ("a.wav", make_wav(seconds=1), "audio/wav")}, headers=H)
    assert bad.status_code == 422

    s1 = creator.post(f"/api/tasks/{o['id']}/submissions", files={"file": ("a.wav", make_wav(freq=200), "audio/wav")}, headers=H)
    assert s1.status_code == 201, s1.text
    dup = creator.post(f"/api/tasks/{o['id']}/submissions", files={"file": ("a.wav", make_wav(freq=200), "audio/wav")}, headers=H)
    assert dup.status_code == 409  # same audio twice

    # creator cap: 20% of 2 units rounds up to 1, so a second item from the same person is refused
    s2 = creator.post(f"/api/tasks/{o['id']}/submissions", files={"file": ("b.wav", make_wav(freq=300), "audio/wav")}, headers=H)
    assert s2.status_code == 409

    # reviewer rejects without reason -> refused; approves with the audio listened
    sid = s1.json()["id"]
    assert reviewer_c.post(f"/api/review/{sid}", json={"decision": "reject"}, headers=H).status_code == 400
    assert reviewer_c.get(f"/api/review/{sid}/audio").status_code == 200
    assert reviewer_c.post(f"/api/review/{sid}", json={"decision": "approve"}, headers=H).status_code == 400  # grade required
    assert reviewer_c.post(f"/api/review/{sid}", json={"decision": "approve", "grade": "B"}, headers=H).json()["status"] == "approved"

    # money: unit = 333; creator 90% = 299 (floor); 70% now = 209, held = 90; seri = 34
    e = creator.get("/api/earnings").json()
    assert e["available_jpy"] == 209 and e["held_jpy"] == 90
    assert e["sales"][0]["buyer"] == "Acme AI" and e["sales"][0]["you_jpy"] == 299

    # buyer gets the file and a data card
    card = buyer.get(f"/api/orders/{o['id']}/datacard").json()
    assert card["items"] == 1 and card["schema"] == "seri.datacard.v1"
    assert buyer.get(card["assets"][0]["download"]).status_code == 200

    # another buyer cannot download it
    other = client()
    signup(other, fresh_email("other"), "buyer")
    assert other.get(card["assets"][0]["download"]).status_code == 404

    # ledger stays balanced
    assert admin.get("/api/admin/ledger/check").json()["balanced"]

    # holds release after the window
    db = SessionLocal()
    released = ledger.release_due_holds(db, at=datetime.now(timezone.utc) + timedelta(days=15))
    db.commit()
    assert released >= 1
    assert ledger.balance(db, f"creator:{creator_user['id']}:held") == 0
    assert ledger.balance(db, f"creator:{creator_user['id']}:available") == -299
    assert ledger.check_integrity(db)["balanced"]
    db.close()


def test_last_unit_takes_leftover_yen(fresh_email):
    buyer, admin = client(), make_staff(fresh_email("admin"), "admin")
    signup(buyer, fresh_email(), "buyer")
    creator = client()
    cu = signup(creator, fresh_email(), "creator")
    o = buyer.post("/api/orders", json={"category": "ja_voice", "units": 3, "unit_price_jpy": 333, "tier": "any"},
                   headers=H).json()
    admin.post(f"/api/admin/orders/{o['id']}/mark-paid", headers=H)
    asset_ids = give_assets(cu["id"], 3)
    db = SessionLocal()
    order = db.get(models.Order, o["id"])
    ledger.post(db, [("cash:escrow", 1), (f"order:{order.id}", -1)], "one extra yen")  # 1000 yen over 3 units
    amounts = []
    for aid in asset_ids:
        amt = ledger.next_unit_amount(db, order)
        amounts.append(amt)
        ledger.settle(db, order, db.get(models.Asset, aid), amt, "task")
    assert amounts == [333, 333, 334]
    assert ledger.order_remaining(db, order) == 0
    db.rollback()
    db.close()


def test_unbalanced_posting_refused():
    db = SessionLocal()
    try:
        ledger.post(db, [("a", 10), ("b", -9)], "bad")
        assert False
    except ledger.LedgerError:
        pass
    finally:
        db.close()


def test_top_tier_needs_rank(fresh_email):
    buyer, creator = client(), client()
    signup(buyer, fresh_email(), "buyer")
    signup(creator, fresh_email(), "creator")
    admin = make_staff(fresh_email("admin"), "admin")
    o = buyer.post("/api/orders", json={"category": "en_voice", "units": 5, "unit_price_jpy": 200, "tier": "top10"},
                   headers=H).json()
    admin.post(f"/api/admin/orders/{o['id']}/mark-paid", headers=H)
    assert all(t["id"] != o["id"] for t in creator.get("/api/tasks").json())  # a new creator has no rank yet


def test_industry_orders_need_verification(fresh_email):
    buyer, creator = client(), client()
    signup(buyer, fresh_email(), "buyer")
    cu = signup(creator, fresh_email(), "creator", industry="nurse")
    admin = make_staff(fresh_email("admin"), "admin")
    o = buyer.post("/api/orders", json={"category": "ja_voice", "units": 5, "unit_price_jpy": 200, "tier": "any",
                                        "industry": "nurse"}, headers=H).json()
    admin.post(f"/api/admin/orders/{o['id']}/mark-paid", headers=H)
    assert all(t["id"] != o["id"] for t in creator.get("/api/tasks").json())
    admin.post(f"/api/admin/users/{cu['id']}/verify-industry", headers=H)
    assert any(t["id"] == o["id"] for t in creator.get("/api/tasks").json())
