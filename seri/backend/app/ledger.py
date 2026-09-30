"""Double-entry money ledger.

Sign convention: positive = money Seri holds (cash), negative = money Seri owes or has earned.
Every posting group sums to exactly zero; nothing is ever edited or deleted.

Accounts
  cash:escrow                 buyer money Seri holds
  order:<id>                  prepaid money not yet earned by anyone
  creator:<id>:available      owed to the creator, withdrawable
  creator:<id>:held           owed to the creator, released after the review window
  seri:revenue                Seri's 10% and featuring fees, minus what Seri covers in refunds
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from . import models
from .config import CREATOR_SHARE_PCT, HOLD_DAYS, IMMEDIATE_PCT


class LedgerError(Exception):
    pass


def post(db: DBSession, lines: list[tuple[str, int]], memo: str) -> str:
    if sum(a for _, a in lines) != 0:
        raise LedgerError(f"unbalanced posting: {lines}")
    if any(not isinstance(a, int) for _, a in lines):
        raise LedgerError("amounts must be whole yen")
    gid = uuid.uuid4().hex
    for account, amount in lines:
        if amount:
            db.add(models.LedgerEntry(group_id=gid, account=account, amount_jpy=amount, memo=memo))
    db.flush()  # later balance() calls in the same request must see this posting
    return gid


def balance(db: DBSession, account: str) -> int:
    return db.query(func.coalesce(func.sum(models.LedgerEntry.amount_jpy), 0)).filter_by(account=account).scalar()


def record_payment(db: DBSession, order: models.Order):
    lines = [("cash:escrow", order.total_jpy + order.promo_fee_jpy), (f"order:{order.id}", -order.total_jpy)]
    if order.promo_fee_jpy:
        lines.append(("seri:revenue", -order.promo_fee_jpy))
    post(db, lines, f"payment order {order.id}")


def order_remaining(db: DBSession, order: models.Order) -> int:
    """Prepaid money in the order not yet paid out or refunded."""
    return -balance(db, f"order:{order.id}")


def units_left(db: DBSession, order: models.Order) -> int:
    return order.units - db.query(models.Sale).filter_by(order_id=order.id).count()


def next_unit_amount(db: DBSession, order: models.Order) -> int:
    """Split what is left in the order over the units left; the last unit takes the leftover yen."""
    left = units_left(db, order)
    return order_remaining(db, order) // left if left > 0 else 0


def settle(db: DBSession, order: models.Order, asset: models.Asset, amount: int, kind: str) -> models.Sale:
    """Pay out one item: 90% to the creator (70% now, 30% held for the buyer's review window), 10% to Seri."""
    creator_part = amount * CREATOR_SHARE_PCT // 100
    seri_part = amount - creator_part
    now_part = creator_part * IMMEDIATE_PCT // 100
    held_part = creator_part - now_part
    cid = asset.creator_id
    sale = models.Sale(asset_id=asset.id, order_id=order.id, buyer_id=order.buyer_id, license=order.license,
                       kind=kind, amount_jpy=amount, creator_jpy=creator_part)
    db.add(sale)
    db.flush()
    post(db, [
        (f"order:{order.id}", amount),
        (f"creator:{cid}:available", -now_part),
        (f"creator:{cid}:held", -held_part),
        ("seri:revenue", -seri_part),
    ], f"sale {sale.id} asset {asset.id}")
    if held_part:
        db.add(models.Hold(creator_id=cid, sale_id=sale.id, amount_jpy=held_part,
                           release_at=datetime.now(timezone.utc) + timedelta(days=HOLD_DAYS)))
    return sale


def refund_order(db: DBSession, order: models.Order, amount: int, memo: str):
    """Return unspent prepaid money to the buyer."""
    if amount <= 0:
        return
    if amount > order_remaining(db, order):
        raise LedgerError("refund exceeds what is left in the order")
    post(db, [(f"order:{order.id}", amount), ("cash:escrow", -amount)], memo)
    order.refunded_jpy += amount


def refund_sale(db: DBSession, sale: models.Sale) -> dict:
    """Upheld complaint: the buyer gets the full price back. The creator's held part pays first;
    Seri covers the rest (its fee and the part already paid out), so buyers are never short."""
    asset = db.get(models.Asset, sale.asset_id)
    hold = db.query(models.Hold).filter_by(sale_id=sale.id, released=False, cancelled=False).first()
    from_creator = hold.amount_jpy if hold else 0
    from_seri = sale.amount_jpy - from_creator
    post(db, [(f"creator:{asset.creator_id}:held", from_creator), ("seri:revenue", from_seri),
              ("cash:escrow", -sale.amount_jpy)], f"refund sale {sale.id}")
    if hold:
        hold.cancelled = True
    sale.refunded = True
    return {"from_creator_jpy": from_creator, "from_seri_jpy": from_seri}


def release_due_holds(db: DBSession, at: datetime | None = None) -> int:
    """Move held money to available once the review window has passed, unless a complaint is still open."""
    at = at or datetime.now(timezone.utc)
    disputed = {sid for (sid,) in db.query(models.Dispute.sale_id).filter_by(status="open")}
    released = 0
    for h in db.query(models.Hold).filter_by(released=False, cancelled=False).all():
        if h.sale_id in disputed or models.aware(h.release_at) > at:
            continue
        post(db, [(f"creator:{h.creator_id}:held", h.amount_jpy),
                  (f"creator:{h.creator_id}:available", -h.amount_jpy)], f"release hold {h.id}")
        h.released = True
        released += 1
    return released


def check_integrity(db: DBSession) -> dict:
    bad = (
        db.query(models.LedgerEntry.group_id)
        .group_by(models.LedgerEntry.group_id)
        .having(func.sum(models.LedgerEntry.amount_jpy) != 0)
        .all()
    )
    total = db.query(func.coalesce(func.sum(models.LedgerEntry.amount_jpy), 0)).scalar()
    return {"balanced": not bad and total == 0, "unbalanced_groups": [g for (g,) in bad]}
