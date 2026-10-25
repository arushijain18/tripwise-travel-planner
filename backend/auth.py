"""Verifies the Supabase JWT sent by the React app.

The frontend logs in with Supabase Auth and sends the access token as
`Authorization: Bearer <token>`. We ask Supabase itself whether the token is valid,
so we never have to handle the JWT secret.
"""
from typing import Optional

import httpx
from fastapi import Header, HTTPException
from pydantic import BaseModel

from config import SUPABASE_ANON_KEY, SUPABASE_URL


class User(BaseModel):
    id: str
    email: Optional[str] = None
    token: str


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Could not reach Supabase auth")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    data = resp.json()
    return User(id=data["id"], email=data.get("email"), token=token)
