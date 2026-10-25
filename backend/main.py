from datetime import datetime, timezone
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import db
import llm
from auth import User, get_current_user
from config import CORS_ORIGINS, MOCK_LLM
from models import RegenerateDay, ShareRequest, TripRequest, TripUpdate

app = FastAPI(title="Personalized Travel Itinerary Planner API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@app.get("/health")
async def health():
    return {"status": "ok", "mock_llm": MOCK_LLM}


# ----------------------------- create / generate ----------------------------- #
@app.post("/api/trips/generate", status_code=201)
async def generate_trip(req: TripRequest, user: User = Depends(get_current_user)):
    try:
        itinerary = await llm.generate_itinerary(req)
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    row = {
        "user_id": user.id,
        "title": itinerary.get("title") or f"Trip to {req.destination}",
        "destination": req.destination,
        "start_date": req.start_date.isoformat(),
        "end_date": req.end_date.isoformat(),
        "budget": req.budget,
        "currency": req.currency.upper(),
        "travelers": req.travelers,
        "preferences": req.model_dump(mode="json"),
        "itinerary": itinerary,
    }
    return await db.insert_trip(user.token, row)


# ------------------------------- read / list --------------------------------- #
@app.get("/api/trips")
async def list_trips(user: User = Depends(get_current_user)):
    return await db.list_trips(user.token, user.id)


@app.get("/api/trips/{trip_id}")
async def get_trip(trip_id: UUID, user: User = Depends(get_current_user)):
    return await db.get_trip(user.token, user.id, str(trip_id))


@app.get("/api/shared/{trip_id}")
async def get_shared_trip(trip_id: UUID):
    """Public, read-only. Works only if the owner switched sharing on."""
    return await db.get_public_trip(str(trip_id))


# ------------------------------ edit / delete -------------------------------- #
@app.put("/api/trips/{trip_id}")
async def update_trip(trip_id: UUID, body: TripUpdate, user: User = Depends(get_current_user)):
    patch: dict = {"updated_at": _now()}
    if body.title is not None:
        patch["title"] = body.title.strip() or "Untitled trip"
    if body.itinerary is not None:
        if not isinstance(body.itinerary.get("days"), list):
            raise HTTPException(status_code=422, detail="itinerary.days must be a list")
        body.itinerary["estimated_total_cost"] = llm.compute_total(body.itinerary)
        patch["itinerary"] = body.itinerary
    return await db.update_trip(user.token, user.id, str(trip_id), patch)


@app.delete("/api/trips/{trip_id}", status_code=204)
async def delete_trip(trip_id: UUID, user: User = Depends(get_current_user)):
    await db.delete_trip(user.token, user.id, str(trip_id))


# ------------------------------ AI re-generation ----------------------------- #
@app.post("/api/trips/{trip_id}/regenerate-day")
async def regenerate_day(trip_id: UUID, body: RegenerateDay, user: User = Depends(get_current_user)):
    trip = await db.get_trip(user.token, user.id, str(trip_id))
    itinerary = trip["itinerary"]
    days = itinerary.get("days", [])
    if not 1 <= body.day <= len(days):
        raise HTTPException(status_code=400, detail="Invalid day number")

    try:
        new_day = await llm.regenerate_day(trip, body.day, body.instruction)
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    days[body.day - 1] = new_day
    itinerary["estimated_total_cost"] = llm.compute_total(itinerary)
    return await db.update_trip(
        user.token, user.id, str(trip_id), {"itinerary": itinerary, "updated_at": _now()}
    )


# --------------------------------- sharing ----------------------------------- #
@app.post("/api/trips/{trip_id}/share")
async def share_trip(trip_id: UUID, body: ShareRequest, user: User = Depends(get_current_user)):
    return await db.update_trip(
        user.token, user.id, str(trip_id), {"is_public": body.is_public, "updated_at": _now()}
    )
