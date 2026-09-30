from datetime import datetime, timedelta, timezone

from conftest import H, client, give_assets, make_staff, make_wav, paid_order, signup

from app import ledger, models, quality
from app.db import SessionLocal
from app.routes_staff import process_deadlines


def _creator_with_level(fresh_email, n=100, grade="A", **extra):
    c = client()
    u = signup(c, fresh_email("creator"), "creator", **extra)
    give_assets(u["id"], n, grade=grade)
    return c, u


def _approve_one(creator, reviewer, order_id, grade="B", freq=200):
    s = creator.post(f"/api/tasks/{order_id}/submissions", files={"file": ("a.wav", make_wav(freq=freq), "audio/wav")},
                     headers=H)
    assert s.status_code == 201, s.text
    r = reviewer.post(f"/api/review/{s.json()['id']}", json={"decision": "approve", "grade": grade}, headers=H)
    assert r.status_code == 200, r.text
    return s.json()["id"]


# ---------- levels ----------


def test_levels_progress(fresh_email):
    c = client()
    u = signup(c, fresh_email(), "creator")
    assert c.get("/api/creator/dashboard").json()["level"]["key"] == "new"
    give_assets(u["id"], 1, grade="B")
    d = c.get("/api/creator/dashboard").json()
    assert d["level"]["key"] == "beginner" and not d["royalties_on"]
    assert any("合格をあと99件" in n for n in d["next"]["needs"])
    give_assets(u["id"], 99, grade="A")  # 99 of 100 are A = 99%
    d = c.get("/api/creator/dashboard").json()
    assert d["level"]["key"] == "regular" and d["royalties_on"]
    assert "30万円" not in str(d["goals"]) and [g["jpy"] for g in d["goals"]] == [30_000, 100_000, 300_000]


def test_low_a_rate_stays_beginner(fresh_email):
    c, _ = _creator_with_level(fresh_email, n=100, grade="B")
    d = c.get("/api/creator/dashboard").json()
    assert d["level"]["key"] == "beginner"
    assert any("品質A" in n for n in d["next"]["needs"])


# ---------- catalog and royalties ----------


def test_catalog_resale_pays_royalties(fresh_email):
    creator, cu = _creator_with_level(fresh_email)
    admin = make_staff(fresh_email("admin"), "admin")
    buyer = client()
    signup(buyer, fresh_email("b2"), "buyer", org="Second AI")

    items = buyer.get("/api/catalog?category=ja_voice&grade=A").json()
    mine = [i for i in items if i["price_jpy"] == 225]  # grade A = 150 × 1.5
    assert len(mine) >= 2
    o = buyer.post("/api/catalog/orders", json={"asset_ids": [mine[0]["id"], mine[1]["id"]]}, headers=H).json()
    assert o["kind"] == "catalog" and o["total_jpy"] == 450 and o["status"] == "awaiting_payment"
    # reserved items disappear from this buyer's catalog and cannot be ordered twice
    assert buyer.post("/api/catalog/orders", json={"asset_ids": [mine[0]["id"]]}, headers=H).status_code == 409

    before = creator.get("/api/creator/dashboard").json()["month"]["royalty_jpy"]
    paid = admin.post(f"/api/admin/orders/{o['id']}/mark-paid", headers=H).json()
    assert paid["sold"] == 2 and paid["status"] == "filled"
    dash = creator.get("/api/creator/dashboard").json()
    assert dash["month"]["royalty_jpy"] - before == 2 * (225 * 90 // 100)
    sales = creator.get("/api/earnings").json()["sales"]
    assert any(s["kind_label"] == "印税" and s["buyer"] == "Second AI" for s in sales)

    card = buyer.get(f"/api/orders/{o['id']}/datacard").json()
    assert card["items"] == 2 and card["grades"]["A"] == 2
    assert buyer.get(card["assets"][0]["download"]).status_code == 200
    assert admin.get("/api/admin/ledger/check").json()["balanced"]


def test_beginner_assets_not_in_catalog(fresh_email):
    _, cu = _creator_with_level(fresh_email, n=5)
    buyer = client()
    signup(buyer, fresh_email(), "buyer")
    db = SessionLocal()
    ids = {a.id for a in db.query(models.Asset).filter_by(creator_id=cu["id"])}
    db.close()
    assert not ids & {i["id"] for i in buyer.get("/api/catalog?limit=500").json()}


def test_unlisted_asset_leaves_catalog(fresh_email):
    creator, cu = _creator_with_level(fresh_email)
    buyer = client()
    signup(buyer, fresh_email(), "buyer")
    aid = creator.get("/api/creator/assets").json()[0]["id"]
    assert creator.post(f"/api/creator/assets/{aid}", json={"listed": False}, headers=H).status_code == 200
    assert aid not in {i["id"] for i in buyer.get("/api/catalog?limit=500").json()}
    other = client()
    signup(other, fresh_email(), "creator")
    assert other.post(f"/api/creator/assets/{aid}", json={"listed": True}, headers=H).status_code == 404


def test_buyout_needs_opt_in_and_stays_exclusive(fresh_email):
    creator, cu = _creator_with_level(fresh_email)
    buyer = client()
    signup(buyer, fresh_email(), "buyer")
    admin, rev = make_staff(fresh_email("admin"), "admin"), make_staff(fresh_email("rev"), "reviewer")
    o = paid_order(buyer, admin, license="buyout", units=5)
    assert all(t["id"] != o["id"] for t in creator.get("/api/tasks").json())
    creator.post("/api/account/settings", json={"accept_buyout": True}, headers=H)
    task = next(t for t in creator.get("/api/tasks").json() if t["id"] == o["id"])
    assert task["royalties"] is False
    _approve_one(creator, rev, o["id"], grade="A", freq=410)
    bought = creator.get("/api/creator/assets").json()[0]
    assert bought["forever_exclusive"] and not bought["in_catalog"]


# ---------- complaints ----------


def test_upheld_complaint_refunds_from_hold(fresh_email):
    buyer, creator = client(), client()
    signup(buyer, fresh_email(), "buyer")
    signup(creator, fresh_email(), "creator")
    admin, rev = make_staff(fresh_email("admin"), "admin"), make_staff(fresh_email("rev"), "reviewer")
    o = paid_order(buyer, admin)  # 2 × ¥500
    _approve_one(creator, rev, o["id"], freq=250)
    e = creator.get("/api/earnings").json()
    assert (e["available_jpy"], e["held_jpy"]) == (315, 135)  # 450 → 70% now, 30% held

    item = buyer.get(f"/api/orders/{o['id']}/datacard").json()["assets"][0]
    assert item["can_dispute"]
    assert buyer.post(f"/api/sales/{item['sale_id']}/dispute", json={"reason": "無音"}, headers=H).status_code == 422
    assert buyer.post(f"/api/sales/{item['sale_id']}/dispute", json={"reason": "途中から別人の声です"},
                      headers=H).status_code == 201
    assert buyer.post(f"/api/sales/{item['sale_id']}/dispute", json={"reason": "もう一度報告します"},
                      headers=H).status_code == 409

    # an open complaint keeps the hold even after the window
    db = SessionLocal()
    ledger.release_due_holds(db, at=datetime.now(timezone.utc) + timedelta(days=30))
    assert not db.query(models.Hold).filter_by(sale_id=item["sale_id"]).one().released
    db.rollback()
    db.close()

    d = admin.get("/api/admin/disputes").json()[0]
    assert d["held_jpy"] == 135
    assert admin.post(f"/api/admin/disputes/{d['id']}", json={"decision": "uphold"}, headers=H).status_code == 400
    r = admin.post(f"/api/admin/disputes/{d['id']}", json={"decision": "uphold", "note": "別人の声を確認"}, headers=H).json()
    assert r == {"id": d["id"], "status": "upheld", "from_creator_jpy": 135, "from_seri_jpy": 365}
    e = creator.get("/api/earnings").json()
    assert (e["available_jpy"], e["held_jpy"]) == (315, 0) and e["sales"][0]["refunded"]
    card = buyer.get(f"/api/orders/{o['id']}/datacard").json()
    assert card["items"] == 0 and card["refunded_items"] == 1 and card["assets"][0]["download"] is None
    assert admin.get("/api/admin/ledger/check").json()["balanced"]


def test_complaint_window_closes(fresh_email):
    buyer, creator = client(), client()
    signup(buyer, fresh_email(), "buyer")
    signup(creator, fresh_email(), "creator")
    admin, rev = make_staff(fresh_email("admin"), "admin"), make_staff(fresh_email("rev"), "reviewer")
    o = paid_order(buyer, admin)
    _approve_one(creator, rev, o["id"], freq=260)
    sale_id = buyer.get(f"/api/orders/{o['id']}/datacard").json()["assets"][0]["sale_id"]
    db = SessionLocal()
    db.get(models.Sale, sale_id).created_at = datetime.now(timezone.utc) - timedelta(days=15)
    db.commit()
    db.close()
    assert buyer.post(f"/api/sales/{sale_id}/dispute", json={"reason": "遅れて気づきました"}, headers=H).status_code == 409


# ---------- deadlines ----------


def test_deadline_downgrade_refunds_difference(fresh_email):
    buyer = client()
    signup(buyer, fresh_email(), "buyer")
    admin = make_staff(fresh_email("admin"), "admin")
    o = paid_order(buyer, admin, tier="top25", unit_price_jpy=1000, fallback="downgrade")  # 2 × 1000 × 1.5
    assert o["total_jpy"] == 3000 and o["deadline_days"] == 28
    db = SessionLocal()
    later = datetime.now(timezone.utc) + timedelta(days=29)
    def mine(results):
        return next(r for r in results if r["order"] == o["id"])

    assert mine(process_deadlines(db, at=later)) == {"order": o["id"], "action": "downgrade", "tier": "top50", "refund_jpy": 600}
    later += timedelta(days=22)
    assert mine(process_deadlines(db, at=later))["refund_jpy"] == 400
    later += timedelta(days=15)
    assert mine(process_deadlines(db, at=later))["action"] == "extend"  # already "anyone"
    order = db.get(models.Order, o["id"])
    assert order.tier == "any" and order.refunded_jpy == 1000 and ledger.order_remaining(db, order) == 2000
    assert ledger.check_integrity(db)["balanced"]
    db.commit()
    db.close()


def test_deadline_refund_closes_order(fresh_email):
    buyer, creator = client(), client()
    signup(buyer, fresh_email(), "buyer")
    signup(creator, fresh_email(), "creator")
    admin, rev = make_staff(fresh_email("admin"), "admin"), make_staff(fresh_email("rev"), "reviewer")
    o = paid_order(buyer, admin, units=5, fallback="refund")
    _approve_one(creator, rev, o["id"], freq=270)
    db = SessionLocal()
    res = process_deadlines(db, at=datetime.now(timezone.utc) + timedelta(days=15))
    assert {"order": o["id"], "action": "refund", "refund_jpy": 2000} in res
    db.commit()
    db.close()
    mine = next(x for x in buyer.get("/api/orders/mine").json() if x["id"] == o["id"])
    assert mine["status"] == "closed" and mine["refunded_jpy"] == 2000 and mine["delivered"] == 1
    assert all(t["id"] != o["id"] for t in creator.get("/api/tasks").json())


# ---------- featuring ----------


def test_featured_order_fee_and_placement(fresh_email):
    buyer, creator = client(), client()
    signup(buyer, fresh_email(), "buyer")
    signup(creator, fresh_email(), "creator")
    admin = make_staff(fresh_email("admin"), "admin")
    before = admin.get("/api/admin/kpis").json()["seri_revenue_jpy"]
    plain = paid_order(buyer, admin)
    featured = paid_order(buyer, admin, promoted=True)
    assert featured["invoice_jpy"] == featured["total_jpy"] + 5000
    assert admin.get("/api/admin/kpis").json()["seri_revenue_jpy"] - before == 5000
    ids = [t["id"] for t in creator.get("/api/tasks").json()]
    assert ids.index(featured["id"]) < ids.index(plain["id"])
    # featuring never changes what the creator earns
    tasks = {t["id"]: t for t in creator.get("/api/tasks").json()}
    assert tasks[featured["id"]]["you_earn_jpy"] == tasks[plain["id"]]["you_earn_jpy"] == 450


# ---------- accounts and people ----------


def test_cancel_only_before_payment(fresh_email):
    buyer = client()
    signup(buyer, fresh_email(), "buyer")
    admin = make_staff(fresh_email("admin"), "admin")
    o = buyer.post("/api/orders", json={"category": "ja_voice", "units": 1, "unit_price_jpy": 100}, headers=H).json()
    assert buyer.post(f"/api/orders/{o['id']}/cancel", headers=H).json()["status"] == "cancelled"
    p = paid_order(buyer, admin)
    assert buyer.post(f"/api/orders/{p['id']}/cancel", headers=H).status_code == 409


def test_password_change_signs_out_other_devices(fresh_email):
    email = fresh_email()
    a, b = client(), client()
    signup(a, email, "buyer")
    assert b.post("/api/auth/login", json={"email": email, "password": "correct-horse-1"}, headers=H).status_code == 200
    assert a.post("/api/account/password", json={"current": "wrong-password", "new": "another-horse-2"},
                  headers=H).status_code == 400
    assert a.post("/api/account/password", json={"current": "correct-horse-1", "new": "another-horse-2"},
                  headers=H).status_code == 200
    assert a.get("/api/me").status_code == 200
    assert b.get("/api/me").status_code == 401


def test_export_and_delete_request(fresh_email):
    creator, cu = _creator_with_level(fresh_email)
    buyer = client()
    signup(buyer, fresh_email(), "buyer")
    data = creator.get("/api/account/export").json()
    assert data["schema"] == "seri.export.v1" and len(data["assets"]) == 100 and data["consents"][0]["text"]
    assert creator.post("/api/account/delete-request", headers=H).json()["deletion_requested"]
    assert creator.get("/api/tasks").json() == []
    ids = {a["id"] for a in data["assets"]}
    assert not ids & {i["id"] for i in buyer.get("/api/catalog?limit=500").json()}


def test_suspended_creator_gets_no_work(fresh_email):
    buyer, creator = client(), client()
    signup(buyer, fresh_email(), "buyer")
    cu = signup(creator, fresh_email(), "creator")
    admin = make_staff(fresh_email("admin"), "admin")
    o = paid_order(buyer, admin)
    assert any(t["id"] == o["id"] for t in creator.get("/api/tasks").json())
    admin.post(f"/api/admin/users/{cu['id']}/suspend", json={"suspended": True}, headers=H)
    assert creator.get("/api/tasks").json() == []
    r = creator.post(f"/api/tasks/{o['id']}/submissions", files={"file": ("a.wav", make_wav(freq=330), "audio/wav")},
                     headers=H)
    assert r.status_code == 404


def test_upheld_complaint_lowers_score(fresh_email):
    _, cu = _creator_with_level(fresh_email, n=10, grade="A")
    db = SessionLocal()
    before = quality.scores(db, "ja_voice")[cu["id"]][0]
    asset = db.query(models.Asset).filter_by(creator_id=cu["id"]).first()
    order = db.get(models.Order, db.get(models.Submission, asset.submission_id).order_id)
    sale = models.Sale(asset_id=asset.id, order_id=order.id, buyer_id=order.buyer_id, license="standard",
                       amount_jpy=100, creator_jpy=90)
    db.add(sale)
    db.flush()
    db.add(models.Dispute(sale_id=sale.id, buyer_id=order.buyer_id, reason="bad", status="upheld"))
    db.flush()
    assert quality.scores(db, "ja_voice")[cu["id"]][0] < before
    db.rollback()
    db.close()


def test_staff_views_require_admin(fresh_email):
    rev = make_staff(fresh_email("rev"), "reviewer")
    for path in ("/api/admin/kpis", "/api/admin/users", "/api/admin/disputes", "/api/admin/audit"):
        assert rev.get(path).status_code == 403
    admin = make_staff(fresh_email("admin"), "admin")
    assert admin.get("/api/admin/audit").json()[0]["action"] == "user.login"


def test_waitlist_rate_limited(fresh_email):
    c = client()
    codes = [c.post("/api/waitlist", json={"email": fresh_email(), "role": "creator"}, headers=H).status_code
             for _ in range(11)]
    assert codes[:10] == [201] * 10 and codes[10] == 429
