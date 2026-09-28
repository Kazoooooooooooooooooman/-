"""ADP SDK — sellers and buyer agents talk to the ADP server in a few lines.

Seller (3 lines):
    import adp
    s = adp.connect("adp_live_yourname", schema="ja_qa.v1")
    s.publish({"q": "...", "a": "..."}, floor_usd=10)

Buyer agent (3 lines):
    import adp
    b = adp.buyer("my-agent")
    for lot in b.lots(): b.bid(lot["id"], 12.5)

Standard library only: nothing to install.
"""

import json
import os
import urllib.error
import urllib.request

__all__ = ["connect", "buyer", "Stream", "Buyer", "ADPError"]

DEFAULT_SERVER = os.environ.get("ADP_SERVER", "http://127.0.0.1:8787")


class ADPError(Exception):
    """The server refused a request, or could not be reached."""


def _call(server, method, path, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        server.rstrip("/") + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode("utf-8")).get("error", str(e))
        except ValueError:
            msg = str(e)
        raise ADPError(msg) from None
    except urllib.error.URLError as e:
        raise ADPError(
            f"ADPサーバーに接続できません ({server})。先に `python adp_server.py` を起動してください。"
        ) from e


class Stream:
    """A seller's connection: publish records into the next 5-minute auction."""

    def __init__(self, api_key, schema, server=None):
        self.api_key = api_key
        self.schema = schema
        self.server = server or DEFAULT_SERVER

    def publish(self, features, floor_usd=10, meta=None):
        """Send one record. Returns its record id."""
        res = _call(
            self.server,
            "POST",
            "/v1/records",
            {"api_key": self.api_key, "schema": self.schema, "features": features, "floor_usd": floor_usd, "meta": meta or {}},
        )
        return res["record_id"]

    def earnings(self):
        """How much this seller has earned so far (USD)."""
        return _call(self.server, "GET", f"/v1/sellers/{self.api_key}")["earned_usd"]


class Buyer:
    """A buyer agent's connection: see open lots, place sealed bids, collect data."""

    def __init__(self, name, server=None):
        self.name = name
        self.server = server or DEFAULT_SERVER

    def lots(self):
        """Lots open for bidding right now."""
        return _call(self.server, "GET", "/v1/lots")["lots"]

    def bid(self, lot_id, amount_usd):
        """Place (or replace) a sealed bid. Other agents cannot see it."""
        return _call(self.server, "POST", f"/v1/lots/{lot_id}/bids", {"buyer": self.name, "amount_usd": amount_usd})

    def results(self):
        """Recently settled lots (winner and price paid)."""
        return _call(self.server, "GET", "/v1/results")["results"]

    def download(self, lot_id):
        """The records of a lot this agent won."""
        return _call(self.server, "GET", f"/v1/deliveries/{lot_id}?buyer={urllib.request.quote(self.name)}")["records"]


def connect(api_key, schema, server=None):
    return Stream(api_key, schema, server)


def buyer(name, server=None):
    return Buyer(name, server)
