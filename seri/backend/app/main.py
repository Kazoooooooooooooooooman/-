"""Seri API + web app.

Run:  uvicorn app.main:app --reload   (from seri/backend)
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import routes_auth, routes_buyer, routes_creator, routes_staff
from .db import Base, engine
from .security import SecurityMiddleware

Base.metadata.create_all(engine)
app = FastAPI(title="Seri", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(SecurityMiddleware)

for module in (routes_auth, routes_buyer, routes_creator, routes_staff):
    app.include_router(module.router)

WEB_DIR = Path(__file__).resolve().parents[2] / "web"
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")  # serves web/404.html for unknown pages
