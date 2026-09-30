"""Double-entry money ledger.

Sign convention: positive = money Seri holds (cash), negative = money Seri owes or has earned.
Every posting group sums to exactly zero; nothing is ever edited or deleted.

Accounts
  cash:escrow                 buyer money Seri holds
  order:<id>                  prepaid money not yet earned by anyone
  creator:<id>:available      owed to the creator, withdrawable
  creator:<id>:held           owed to the creator, released after the review window
  seri:revenue                Seri's 10%
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
    return gid


def balance(db: DBSession, account: str) -> int:
    return db.query(func.coalesce(func.sum(models.LedgerEntry.amount_jpy), 0)).filter_by(account=account).scalar()


def record_payment(db: DBSession, order: models.Order):
    post(db, [("cash:escrow", order.total_jpy), (f"order:{order.id}", -order.total_jpy)], f"payment order {order.id}")


def unit_amount(order: models.Order, index: int) -> int:
    """Split the order total over its units; the last unit takes the leftover yen."""
    base = order.total_jpy // order.units
    return base + (order.total_jpy - base * order.units if index == order.units - 1 else 0)


def settle_unit(db: DBSession, order: models.Order, asset: models.Asset, index: int) -> models.Sale:
    amount = unit_amount(order, index)
    creator_part = amount * CREATOR_SHARE_PCT // 100
    seri_part = amount - creator_part
    now_part = creator_part * IMMEDIATE_PCT // 100
    held_part = creator_part - now_part
    cid = asset.creator_id
    sale = models.Sale(asset_id=asset.id, order_id=order.id, buyer_id=order.buyer_id, license=order.license,
                       amount_jpy=amount, creator_jpy=creator_part)
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


def release_due_holds(db: DBSession, at: datetime | None = None) -> int:
    at = at or datetime.now(timezone.utc)
    released = 0
    for h in db.query(models.Hold).filter_by(released=False).all():
        due = h.release_at if h.release_at.tzinfo else h.release_at.replace(tzinfo=timezone.utc)
        if due <= at:
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
