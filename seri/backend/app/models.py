"""Database tables.

Two tables are append-only by design and must never be updated or deleted in place:
- ledger_entries: every yen that moves, as balanced double-entry groups
- audit_logs: who did what, when
"""

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    org: Mapped[str] = mapped_column(String(200), default="")  # buyer's company name
    role: Mapped[str] = mapped_column(String(20))  # creator | buyer | reviewer | admin
    password_hash: Mapped[str] = mapped_column(String(300))
    industry: Mapped[str] = mapped_column(String(40), default="")  # creator's claimed industry
    industry_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    accept_buyout: Mapped[bool] = mapped_column(Boolean, default=False)  # creator opts in to buyout orders
    suspended: Mapped[bool] = mapped_column(Boolean, default=False)  # no new work, assets leave the catalog
    deletion_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Session(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Consent(Base):
    __tablename__ = "consents"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    version: Mapped[str] = mapped_column(String(40))
    text_sha256: Mapped[str] = mapped_column(String(64))
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def aware(dt: datetime | None) -> datetime | None:
    """SQLite drops time zones; every stored time is UTC."""
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


class Waitlist(Base):
    __tablename__ = "waitlist"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254))
    role: Mapped[str] = mapped_column(String(20))
    note: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Order(Base):
    """A buyer's purchase. kind=commission: creators make new data. kind=catalog: re-license existing assets."""

    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="commission")
    category: Mapped[str] = mapped_column(String(40))
    instructions: Mapped[str] = mapped_column(Text, default="")
    units: Mapped[int] = mapped_column(Integer)
    unit_price_jpy: Mapped[int] = mapped_column(Integer)
    tier: Mapped[str] = mapped_column(String(10))
    industry: Mapped[str] = mapped_column(String(40), default="")
    license: Mapped[str] = mapped_column(String(20))
    tier_multiplier: Mapped[float] = mapped_column()
    industry_multiplier: Mapped[float] = mapped_column()
    total_jpy: Mapped[int] = mapped_column(Integer)  # the data amount; creators are paid from this
    promo_fee_jpy: Mapped[int] = mapped_column(Integer, default=0)  # featuring fee, Seri revenue, on the same invoice
    refunded_jpy: Mapped[int] = mapped_column(Integer, default=0)
    fallback: Mapped[str] = mapped_column(String(20), default="extend")
    deadline_days: Mapped[int] = mapped_column(Integer, default=14)
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # set when paid
    # awaiting_payment | open | filled | closed (ended by deadline with a refund) | cancelled (before payment)
    status: Mapped[str] = mapped_column(String(20), default="awaiting_payment")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OrderItem(Base):
    """One catalog asset in a catalog order, at the price quoted when ordered."""

    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"))
    price_jpy: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="reserved")  # reserved | sold | refunded


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("sha256", name="uq_submission_sha256"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    file_key: Mapped[str] = mapped_column(String(80))
    sha256: Mapped[str] = mapped_column(String(64))
    checks: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20))  # pending | approved | rejected
    reason: Mapped[str] = mapped_column(String(500), default="")
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Asset(Base):
    """The registry: one row per approved piece of data, its owner and its provenance."""

    __tablename__ = "assets"
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"), unique=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    category: Mapped[str] = mapped_column(String(40))
    sha256: Mapped[str] = mapped_column(String(64))
    consent_id: Mapped[int] = mapped_column(ForeignKey("consents.id"))
    grade: Mapped[str] = mapped_column(String(1), default="B")
    duration_sec: Mapped[float] = mapped_column(default=0.0)
    listed: Mapped[bool] = mapped_column(Boolean, default=True)  # the creator may take it off the catalog
    exclusive_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | removed (after an upheld complaint)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Sale(Base):
    """A license of one asset to one buyer. Standard licenses let the same asset sell again."""

    __tablename__ = "sales"
    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    license: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(20), default="task")  # task (made to order) | royalty (catalog resale)
    amount_jpy: Mapped[int] = mapped_column(Integer)
    creator_jpy: Mapped[int] = mapped_column(Integer)
    refunded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[str] = mapped_column(String(40), index=True)
    account: Mapped[str] = mapped_column(String(80), index=True)
    amount_jpy: Mapped[int] = mapped_column(Integer)  # every group sums to zero
    memo: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Hold(Base):
    __tablename__ = "holds"
    id: Mapped[int] = mapped_column(primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"))
    amount_jpy: Mapped[int] = mapped_column(Integer)
    release_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    released: Mapped[bool] = mapped_column(Boolean, default=False)
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)  # used for a refund instead


class Dispute(Base):
    """A buyer's complaint about one delivered item, raised inside the review window."""

    __tablename__ = "disputes"
    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), unique=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reason: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | upheld | rejected
    resolution: Mapped[str] = mapped_column(String(500), default="")
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(60))
    target: Mapped[str] = mapped_column(String(80), default="")
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
