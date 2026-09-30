# Seri — web app (MVP)

Seri is a marketplace for human data. AI companies order data. Creators record it on their phone or PC. A reviewer checks it. The creator gets paid when it's sold, and every step goes through a double-entry ledger.

## What's here

| Part | Where | What it does |
|---|---|---|
| Landing page | `web/index.html` | Waitlist for creators and buyers |
| Buyer | `web/app/buyer.html` | Order data with a live price quote (tier × industry multipliers); download delivered files plus a data card |
| Creator | `web/app/creator.html` | Record in the browser (phone or PC), get an instant quality pre-check, submit, see earnings and where each sale went |
| Review / admin | `web/app/review.html` | Listen and approve/reject with a reason; mark orders paid, release holds, check ledger integrity, see the waitlist |
| API | `backend/app/` | FastAPI + SQLAlchemy (SQLite locally, Postgres-ready) |

Money rules live in `backend/app/config.py`:
- Creators get 90%.
- Of that, 70% is paid right away and 30% is held for 14 days.
- One creator can fill at most 20% of an order.
- Each category has a floor price.

Values marked (仮) are placeholders.

## Run locally

```bash
cd seri/backend
pip install -r requirements.txt
python seed_demo.py                     # admin@seri.example.com / reviewer@seri.example.com, password: seri-demo-pass
python -m uvicorn app.main:app --port 8000
```

Open http://localhost:8000. Buyers and creators sign up from the login page. Browsers only allow the microphone on `localhost` or HTTPS.

Demo flow:
1. A buyer places an order.
2. The admin clicks 入金を記録 (mark paid).
3. A creator records and submits.
4. The reviewer approves.
5. The creator sees their earnings, and the buyer can download.

## Tests

```bash
cd seri/backend && python -m pytest -q
```

The tests cover:
- Pricing, the CSRF guard, and security headers.
- Consent, password rules, login throttling, and role checks.
- WAV quality checks.
- The full money flow, including ledger balance and hold release.
- Tier and industry eligibility.

## Security built in (toward ISO 27001 / SOC 2)

- Passwords are hashed with scrypt. Sessions use httponly SameSite cookies (`SERI_COOKIE_SECURE=1` behind HTTPS).
- Every state-changing request needs a CSRF header. Logins are throttled after 5 failures.
- Strict CSP (no inline scripts), `frame-ancestors 'none'`, nosniff, HSTS on HTTPS, and `no-store` on the API.
- Role-based access: buyers can only download what they bought, and reviewers can't review their own work.
- An append-only audit log records sign-ins, orders, payments, reviews, and admin actions.
- Data minimization: recordings that fail the automatic check are never stored, and duplicates are refused by SHA-256.
- The consent version is recorded per creator.

## Not done yet (needed before real users)

- Domain, HTTPS, and hosting (AWS Tokyo assumed). Postgres and S3 via `SERI_DATABASE_URL` and a storage swap.
- Stripe for buyer payment (admin marks orders paid by hand today) and bank payouts for creators.
- Identity verification (eKYC) and email verification.
- The QA agent: automatic speech recognition plus AI rule checks before human review.
- A third-party security assessment, then the ISO 27001 ISMS, then a SOC 2 audit.
