"""All the generative-AI logic: prompt engineering, calling Gemini, cleaning the result."""
import asyncio
import json
import re
from datetime import date, timedelta

import httpx

from config import GEMINI_API_KEY, GEMINI_MODEL, MOCK_LLM
from models import TripRequest

ACTIVITY_TYPES = {"attraction", "food", "transport", "activity"}


class LLMError(Exception):
    pass


# --------------------------------------------------------------------------- #
# Prompt engineering
# --------------------------------------------------------------------------- #
SYSTEM_PROMPT = """You are an expert local travel planner. You build realistic, well-paced,
budget-aware itineraries. Rules:
- Group nearby places on the same day to minimise travel time.
- Respect the pace: relaxed = 2-3 activities/day, moderate = 4-5, packed = 6-7.
- Include breakfast/lunch/dinner suggestions as activities of type "food".
- All costs are numbers in the requested currency, for the WHOLE group (not per person).
  Activity costs must include food, entry fees and local transport, but NOT accommodation.
- accommodation[].price_per_night is the nightly price for the whole group's stay.
- Keep the total (activities + accommodation nights) at or below the budget.
- Prefer real, well-known places and areas; do not invent addresses.
- Respond with ONLY a single valid JSON object. No markdown, no commentary."""

ITINERARY_SCHEMA = """{
  "title": "short trip title",
  "summary": "2-3 sentence overview of the trip",
  "days": [
    {
      "day": 1,
      "theme": "short theme for the day",
      "activities": [
        {
          "time": "09:00",
          "title": "name of the activity or place",
          "description": "1-2 sentences, why it is worth it and any tip",
          "type": "attraction | food | transport | activity",
          "location": "area or neighbourhood",
          "cost": 0
        }
      ]
    }
  ],
  "accommodation": [
    {"name": "hotel or stay name", "area": "neighbourhood", "price_per_night": 0, "why": "why it fits"}
  ],
  "transport": {"getting_there": "how to reach the destination", "local": "how to get around"},
  "tips": ["3-5 practical tips"]
}"""


def _brief(req: dict) -> str:
    interests = ", ".join(req.get("interests") or []) or "general sightseeing"
    return (
        f"Destination: {req['destination']}\n"
        f"Dates: {req['start_date']} to {req['end_date']}\n"
        f"Number of days: {req['num_days']}\n"
        f"Travellers: {req['travelers']} ({req['group_type']})\n"
        f"Total budget: {req['budget']} {req['currency']}\n"
        f"Travel style: {req['travel_style']}\n"
        f"Pace: {req['pace']}\n"
        f"Interests: {interests}\n"
        f"Extra notes: {req.get('notes') or 'none'}"
    )


def _req_dict(req: TripRequest) -> dict:
    d = req.model_dump(mode="json")
    d["num_days"] = req.num_days
    return d


# --------------------------------------------------------------------------- #
# Gemini call
# --------------------------------------------------------------------------- #
async def _call_gemini(system: str, user: str) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": 0.7, "responseMimeType": "application/json"},
    }
    last_error = "unknown error"
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(url, headers={"x-goog-api-key": GEMINI_API_KEY}, json=body)
        except httpx.HTTPError as e:
            last_error = f"network error ({type(e).__name__})"
            await asyncio.sleep(2)
            continue

        if resp.status_code in (429, 500, 503):  # rate limit / temporary overload -> retry
            last_error = f"Gemini busy ({resp.status_code})"
            await asyncio.sleep(3 * (attempt + 1))
            continue
        if resp.status_code != 200:
            raise LLMError(f"Gemini API error {resp.status_code}: {resp.text[:300]}")

        try:
            parts = resp.json()["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError, ValueError):
            raise LLMError("The model returned an empty response. Try rephrasing your notes.")
        return "".join(p.get("text", "") for p in parts if not p.get("thought"))

    raise LLMError(f"Could not reach the AI service: {last_error}. Please try again in a minute.")


def _parse_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            raise
        return json.loads(match.group(0))


async def _ask_json(system: str, user: str) -> dict:
    if not GEMINI_API_KEY:
        raise LLMError("GEMINI_API_KEY is not set on the server (or set MOCK_LLM=true for demo data).")
    for _ in range(2):  # one retry if the model returns broken JSON
        text = await _call_gemini(system, user)
        try:
            data = _parse_json(text)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            continue
    raise LLMError("The model returned invalid JSON twice. Please try again.")


# --------------------------------------------------------------------------- #
# Cleaning / validating the model output
# --------------------------------------------------------------------------- #
def _num(v) -> float:
    try:
        n = float(v)
        return n if n >= 0 else 0.0
    except (TypeError, ValueError):
        return 0.0


def _normalize_day(day: dict, index: int, start: date) -> dict:
    if not isinstance(day, dict):
        day = {}
    activities = []
    for a in day.get("activities") if isinstance(day.get("activities"), list) else []:
        if not isinstance(a, dict):
            continue
        activities.append(
            {
                "time": str(a.get("time") or ""),
                "title": str(a.get("title") or "Untitled"),
                "description": str(a.get("description") or ""),
                "type": a.get("type") if a.get("type") in ACTIVITY_TYPES else "activity",
                "location": str(a.get("location") or ""),
                "cost": _num(a.get("cost")),
            }
        )
    return {
        "day": index + 1,
        "date": (start + timedelta(days=index)).isoformat(),
        "theme": str(day.get("theme") or f"Day {index + 1}"),
        "activities": activities,
    }


def compute_total(itinerary: dict) -> float:
    """Estimated total = every activity cost + (nights x first accommodation price)."""
    days = itinerary.get("days") or []
    activity_cost = sum(_num(a.get("cost")) for d in days for a in d.get("activities", []))
    stays = itinerary.get("accommodation") or []
    nightly = _num(stays[0].get("price_per_night")) if stays and isinstance(stays[0], dict) else 0.0
    nights = max(len(days) - 1, 0)
    return round(activity_cost + nightly * nights, 2)


def normalize_itinerary(raw: dict, start: date, num_days: int) -> dict:
    raw_days = raw.get("days") if isinstance(raw.get("days"), list) else []
    days = [_normalize_day(d, i, start) for i, d in enumerate(raw_days[:num_days])]

    stays = []
    for s in raw.get("accommodation") if isinstance(raw.get("accommodation"), list) else []:
        if isinstance(s, dict):
            stays.append(
                {
                    "name": str(s.get("name") or "Stay"),
                    "area": str(s.get("area") or ""),
                    "price_per_night": _num(s.get("price_per_night")),
                    "why": str(s.get("why") or ""),
                }
            )

    transport = raw.get("transport") if isinstance(raw.get("transport"), dict) else {}
    tips = [str(t) for t in raw.get("tips", []) if t] if isinstance(raw.get("tips"), list) else []

    itinerary = {
        "title": str(raw.get("title") or ""),
        "summary": str(raw.get("summary") or ""),
        "days": days,
        "accommodation": stays,
        "transport": {
            "getting_there": str(transport.get("getting_there") or ""),
            "local": str(transport.get("local") or ""),
        },
        "tips": tips,
    }
    itinerary["estimated_total_cost"] = compute_total(itinerary)
    return itinerary


# --------------------------------------------------------------------------- #
# Public functions used by the API
# --------------------------------------------------------------------------- #
async def generate_itinerary(req: TripRequest) -> dict:
    if MOCK_LLM:
        return normalize_itinerary(_mock_itinerary(req), req.start_date, req.num_days)

    user_prompt = (
        f"Create a day-by-day itinerary for this trip.\n\n{_brief(_req_dict(req))}\n\n"
        f"Return JSON in exactly this shape (include all {req.num_days} days):\n{ITINERARY_SCHEMA}"
    )
    raw = await _ask_json(SYSTEM_PROMPT, user_prompt)
    itinerary = normalize_itinerary(raw, req.start_date, req.num_days)
    if not itinerary["days"]:
        raise LLMError("The model did not return any days. Please try again.")
    return itinerary


async def regenerate_day(trip: dict, day_number: int, instruction: str) -> dict:
    prefs = dict(trip["preferences"])
    prefs["num_days"] = (date.fromisoformat(prefs["end_date"]) - date.fromisoformat(prefs["start_date"])).days + 1
    start = date.fromisoformat(prefs["start_date"])
    days = trip["itinerary"].get("days", [])

    if MOCK_LLM:
        req = TripRequest(**{k: v for k, v in prefs.items() if k != "num_days"})
        mock_day = _mock_itinerary(req)["days"][day_number - 1]
        mock_day["theme"] = f"{mock_day['theme']} (regenerated)"
        return _normalize_day(mock_day, day_number - 1, start)

    others = "\n".join(
        f"- Day {d['day']}: {d['theme']} -> " + ", ".join(a["title"] for a in d["activities"])
        for d in days
        if d["day"] != day_number
    )
    current = days[day_number - 1]
    user_prompt = (
        f"Here is a trip:\n\n{_brief(prefs)}\n\n"
        f"The other days already planned (do NOT repeat these places):\n{others or '(none)'}\n\n"
        f"Rewrite ONLY day {day_number}. Its current plan was: {current['theme']} -> "
        + ", ".join(a["title"] for a in current["activities"])
        + f"\nUser request for the new version: {instruction or 'Give me a fresh alternative plan for this day.'}\n\n"
        'Return JSON in exactly this shape: {"theme": "...", "activities": [{"time": "09:00", "title": "...", '
        '"description": "...", "type": "attraction | food | transport | activity", "location": "...", "cost": 0}]}'
    )
    raw = await _ask_json(SYSTEM_PROMPT, user_prompt)
    day = _normalize_day(raw, day_number - 1, start)
    if not day["activities"]:
        raise LLMError("The model did not return any activities. Please try again.")
    return day


# --------------------------------------------------------------------------- #
# Offline demo data (MOCK_LLM=true)
# --------------------------------------------------------------------------- #
def _mock_itinerary(req: TripRequest) -> dict:
    per_day = max(req.budget / req.num_days * 0.6 / 5, 100)
    days = []
    for i in range(req.num_days):
        days.append(
            {
                "theme": ["Old town & heritage", "Local food trail", "Nature escape", "Markets & culture"][i % 4],
                "activities": [
                    {"time": "09:00", "title": f"Breakfast near {req.destination} centre", "description": "Start with a local breakfast spot.", "type": "food", "location": "City centre", "cost": per_day * 0.4},
                    {"time": "10:30", "title": f"Top landmark of {req.destination}", "description": "Go early to beat the crowd.", "type": "attraction", "location": "Old town", "cost": per_day * 0.8},
                    {"time": "13:00", "title": "Lunch at a popular local restaurant", "description": "Try the regional speciality.", "type": "food", "location": "Market area", "cost": per_day * 0.7},
                    {"time": "15:00", "title": "Guided walk or local experience", "description": "A relaxed afternoon activity.", "type": "activity", "location": "Heritage district", "cost": per_day * 0.9},
                    {"time": "20:00", "title": "Dinner and evening stroll", "description": "Finish the day with a scenic walk.", "type": "food", "location": "Waterfront", "cost": per_day * 1.0},
                ],
            }
        )
    return {
        "title": f"{req.num_days}-day trip to {req.destination}",
        "summary": f"A demo itinerary for {req.destination}. Set MOCK_LLM=false and add a GEMINI_API_KEY for real AI plans.",
        "days": days,
        "accommodation": [{"name": "Comfortable central hotel", "area": "City centre", "price_per_night": req.budget * 0.12, "why": "Walkable to most attractions."}],
        "transport": {"getting_there": "Book trains or flights early for better prices.", "local": "Use local taxis or ride-hailing apps."},
        "tips": ["Carry some cash.", "Start early to avoid crowds.", "Keep digital copies of your tickets."],
    }
