from datetime import date
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator

MAX_TRIP_DAYS = 14


class TripRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=100)
    start_date: date
    end_date: date
    budget: float = Field(gt=0, description="Total budget for the whole group")
    currency: str = Field(default="INR", min_length=3, max_length=3)
    travelers: int = Field(default=1, ge=1, le=50)
    group_type: str = Field(default="solo")  # solo | couple | friends | family
    travel_style: str = Field(default="balanced")  # budget | balanced | premium
    pace: str = Field(default="moderate")  # relaxed | moderate | packed
    interests: list[str] = Field(default_factory=list, max_length=12)
    notes: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if (self.end_date - self.start_date).days + 1 > MAX_TRIP_DAYS:
            raise ValueError(f"Trips are limited to {MAX_TRIP_DAYS} days")
        return self

    @property
    def num_days(self) -> int:
        return (self.end_date - self.start_date).days + 1


class TripUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=150)
    itinerary: Optional[dict[str, Any]] = None


class RegenerateDay(BaseModel):
    day: int = Field(ge=1, le=MAX_TRIP_DAYS)
    instruction: str = Field(default="", max_length=300)


class ShareRequest(BaseModel):
    is_public: bool
