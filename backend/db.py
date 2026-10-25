"""Tiny Supabase (PostgREST) client.

Requests are made with the *user's* token, so Postgres Row Level Security
applies. We also filter by user_id explicitly as a second safety net.
"""
from typing import Any, Optional

import httpx
from fastapi import HTTPException

from config import SUPABASE_ANON_KEY, SUPABASE_URL

LIST_COLUMNS = "id,title,destination,start_date,end_date,budget,currency,travelers,is_public,created_at"


async def _request(method: str, token: str, params: Optional[dict] = None, body: Any = None, return_rows: bool = False):
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if return_rows:
        headers["Prefer"] = "return=representation"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.request(
                method, f"{SUPABASE_URL}/rest/v1/trips", headers=headers, params=params, json=body
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Could not reach the database")
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Database error: {resp.text[:300]}")
    return resp.json() if resp.text else None


async def insert_trip(token: str, row: dict) -> dict:
    rows = await _request("POST", token, body=row, return_rows=True)
    return rows[0]


async def list_trips(token: str, user_id: str) -> list[dict]:
    params = {"select": LIST_COLUMNS, "user_id": f"eq.{user_id}", "order": "created_at.desc"}
    return await _request("GET", token, params=params)


async def get_trip(token: str, user_id: str, trip_id: str) -> dict:
    params = {"select": "*", "id": f"eq.{trip_id}", "user_id": f"eq.{user_id}"}
    rows = await _request("GET", token, params=params)
    if not rows:
        raise HTTPException(status_code=404, detail="Trip not found")
    return rows[0]


async def get_public_trip(trip_id: str) -> dict:
    params = {"select": "*", "id": f"eq.{trip_id}", "is_public": "eq.true"}
    rows = await _request("GET", SUPABASE_ANON_KEY, params=params)
    if not rows:
        raise HTTPException(status_code=404, detail="Trip not found or not shared")
    trip = rows[0]
    trip.pop("user_id", None)  # don't leak the owner's id
    return trip


async def update_trip(token: str, user_id: str, trip_id: str, patch: dict) -> dict:
    params = {"id": f"eq.{trip_id}", "user_id": f"eq.{user_id}"}
    rows = await _request("PATCH", token, params=params, body=patch, return_rows=True)
    if not rows:
        raise HTTPException(status_code=404, detail="Trip not found")
    return rows[0]


async def delete_trip(token: str, user_id: str, trip_id: str) -> None:
    params = {"id": f"eq.{trip_id}", "user_id": f"eq.{user_id}"}
    rows = await _request("DELETE", token, params=params, return_rows=True)
    if not rows:
        raise HTTPException(status_code=404, detail="Trip not found")
