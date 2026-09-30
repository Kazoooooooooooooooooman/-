"""Create demo staff accounts for local testing. Never run this against production.

    python seed_demo.py

Creates admin@seri.example.com and reviewer@seri.example.com (password: seri-demo-pass).
Buyers and creators sign up from the web pages as usual.
"""
from app import models
from app.db import Base, SessionLocal, engine
from app.security import hash_password

PASSWORD = "seri-demo-pass"
STAFF = [("admin@seri.example.com", "管理者", "admin"), ("reviewer@seri.example.com", "審査担当", "reviewer")]


def main():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    for email, name, role in STAFF:
        if not db.query(models.User).filter_by(email=email).first():
            db.add(models.User(email=email, name=name, role=role, password_hash=hash_password(PASSWORD)))
            print(f"created {role}: {email}")
    db.commit()
    db.close()
    print(f"password: {PASSWORD}")


if __name__ == "__main__":
    main()
