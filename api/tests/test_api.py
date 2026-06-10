"""API integration tests against a temp SQLite DB (seeded + ingested once via startup).

Two assertions, one per high-value invariant:
  - the alert state machine rejects illegal transitions (resolve before acknowledge -> 409)
  - multi-tenant scoping hides other companies' alerts (list excludes + detail 404)
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

ALICE = {"Authorization": "Bearer brookfield-alice-token"}  # Brookfield Properties
CAROL = {"Authorization": "Bearer hines-carol-token"}        # Hines
RESOLUTION = {"resolution_type": "fixed", "root_cause": "rc", "action_taken": "act"}


@pytest.fixture(scope="module")
def client():
    # Context-manager form fires the startup event -> seed + ingest into the temp DB.
    with TestClient(app) as c:
        yield c


def test_resolve_requires_acknowledge_first(client):
    # A freshly-ingested alert is `new`.
    aid = client.get("/alerts", params={"status": "new", "page_size": 1}, headers=ALICE).json()["data"][0]["id"]

    # resolve while `new` -> 409 (must acknowledge first)
    r = client.post(f"/alerts/{aid}/resolve", json=RESOLUTION, headers=ALICE)
    assert r.status_code == 409

    # acknowledge -> 200
    assert client.post(f"/alerts/{aid}/acknowledge", headers=ALICE).status_code == 200

    # now resolve -> 200, lands in `resolved`
    r = client.post(f"/alerts/{aid}/resolve", json=RESOLUTION, headers=ALICE)
    assert r.status_code == 200
    assert r.json()["status"] == "resolved"


def test_company_scoping(client):
    # An alert that belongs to Brookfield (Alice can see it)...
    brookfield_id = client.get("/alerts", params={"page_size": 1}, headers=ALICE).json()["data"][0]["id"]

    # ...is absent from Hines' (Carol's) list...
    hines = client.get("/alerts", params={"page_size": 100}, headers=CAROL).json()["data"]
    assert brookfield_id not in {a["id"] for a in hines}

    # ...and a cross-company detail fetch 404s (don't reveal existence).
    assert client.get(f"/alerts/{brookfield_id}", headers=CAROL).status_code == 404
