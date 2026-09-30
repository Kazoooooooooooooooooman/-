# Seri — web app (MVP)

Seri is a marketplace for human data. AI companies order data. Creators record it on their phone or PC. A reviewer checks it. The creator gets paid when it's sold, and every step goes through a double-entry ledger.

## What's here

| Part | Where | What it does |
|---|---|---|
| Public site | `web/index.html`, `standard.html`, `terms.html`, `privacy.html`, `tokushoho.html`, `404.html` | Landing page with waitlist and public numbers; Seri Standard (quality criteria); legal pages (**drafts, need a lawyer**) |
| Creator | `web/app/creator.html`, `assets.html` | This month's income against the ¥30k / ¥100k / ¥300k goals, level (beginner → regular → pro → top), rank within category and verified industry, jobs (featured first), in-browser recording with a pre-check, assets with catalog status, every sale (task pay vs royalty) |
| Buyer | `web/app/buyer.html`, `catalog.html` | Order with a live quote (tier × industry, featuring fee, deadline and what happens if it's missed), cancel before payment, delivery view with download, data card, and problem reports; catalog to re-license verified data |
| Reviewer | `web/app/review.html` | Listen and grade A/B/C, or reject with a reason |
| Admin | `web/app/admin.html` | KPIs and success rate, mark invoices paid, deadlines / hold release / ledger check, rule on complaints, creators (verify industry, suspend), industry leaderboard, audit log |
| Everyone | `web/app/account.html` | Password change (signs out other devices), consent history, export my data, deletion request, buyout opt-in (creators) |
| API | `backend/app/` | FastAPI + SQLAlchemy (SQLite locally, Postgres-ready). `routes_*.py` by role, rules in `config.py` |

Business rules live in `backend/app/config.py`. Values marked (仮) are placeholders.

**Money**
- Creators get 90%. Of that, 70% is paid right away and 30% is held for 14 days.
- A buyer can report a problem within those 14 days. If upheld, the buyer gets a full refund: the creator's held part pays first and Seri covers the rest. The asset is pulled from sale and counts against the creator's quality score.

**Pricing and orders**
- Order price = units × unit price × industry multiplier × tier multiplier.
- Featuring an order costs a flat fee. It only changes where the order appears in creators' job lists, never pay or review.
- Each tier has a deadline. When it passes, the order does what the buyer chose: extend, drop one tier and refund the difference, or close and refund the rest.
- One creator can fill at most 20% of an order.

**Catalog and licenses**
- Standard (non-exclusive) assets from creators at *regular* level or above go into the catalog, and every resale pays them a royalty.
- Buyout, evaluation and term-exclusive licenses keep an asset out of the catalog (term-exclusive for 6 months). Buyout jobs only go to creators who opt in.

## Run locally

```bash
cd seri/backend
pip install -r requirements.txt
python seed_demo.py --sample            # demo accounts + orders, sales and a complaint (omit --sample for staff only)
python -m uvicorn app.main:app --port 8000
```

Open http://localhost:8000. Every demo account uses the password `seri-demo-pass`:
- `admin@seri.example.com` / `reviewer@seri.example.com`
- `buyer@seri.example.com` / `lab@seri.example.com`
- `hanako@seri.example.com` (regular, verified nurse) / `taro@seri.example.com` (beginner)

Browsers only allow the microphone on `localhost` or HTTPS.

The database schema is created on start. There are no migrations yet, so delete `backend/data/` after model changes. Add Alembic before real data exists.

## Click-through demo (no server)

```bash
cd seri/demo && python build_demo.py dist
```

Builds a static copy of every screen with the sample data (answers come from a snapshot of real API responses in `snapshot.js`). Nothing is saved; recording and downloads are off. Open `dist/hub.html` from any static host.

## Tests

```bash
cd seri/backend && python -m pytest -q
```

The tests cover:
- Pricing, the CSRF guard, security headers, and rate limits.
- Consent, password rules, login throttling, and role checks.
- WAV quality checks.
- The full money flow: ledger balance, hold release, leftover yen.
- Tier and industry eligibility.
- Levels, catalog royalties, and exclusivity.
- Complaints and refunds, including the complaint window.
- Deadline fallbacks and featured orders.
- Account actions: password change, export, deletion.
- Suspension.

## Security built in (toward ISO 27001 / SOC 2)

- Passwords are hashed with scrypt. Sessions use httponly SameSite cookies (`SERI_COOKIE_SECURE=1` behind HTTPS).
- Every state-changing request needs a CSRF header. Logins are throttled after 5 failures.
- Strict CSP (no inline scripts), `frame-ancestors 'none'`, nosniff, HSTS on HTTPS, and `no-store` on the API.
- Role-based access: buyers can only download what they bought, and reviewers can't review their own work.
- An append-only audit log records sign-ins, orders, payments, reviews, complaints, and admin actions, and admins can view it.
- Signup and waitlist are rate-limited per IP.
- Creators can export their data and request deletion. Deletion stops sales immediately.
- Data minimization: recordings that fail the automatic check are never stored, and duplicates are refused by SHA-256.
- The consent version is recorded per creator.

## Not done yet (needed before real users)

- Domain, HTTPS, and hosting (AWS Tokyo assumed). Postgres and S3 via `SERI_DATABASE_URL` and a storage swap.
- Stripe for buyer payment (admin marks orders paid by hand today) and bank payouts for creators.
- Identity verification (eKYC) and email verification.
- The QA agent: automatic speech recognition plus AI rule checks before human review.
- A third-party security assessment, then the ISO 27001 ISMS, then a SOC 2 audit.
- Email notifications (review results, payouts, complaints) and a daily scheduler for deadlines and hold release (both are admin buttons today).
- Database migrations (Alembic).
- Lawyer review of the terms, privacy policy, consent text and 特商法 page.
