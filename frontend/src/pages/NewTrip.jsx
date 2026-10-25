import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { daysBetween } from "../utils";

const INTERESTS = ["Food", "Sightseeing", "Adventure", "Culture", "History", "Nature", "Shopping", "Nightlife", "Relaxation", "Photography"];
const GROUPS = [
  ["solo", "Solo"],
  ["couple", "Couple"],
  ["friends", "Friends"],
  ["family", "Family"],
];
const STYLES = [
  ["budget", "Budget"],
  ["balanced", "Balanced"],
  ["premium", "Premium"],
];
const PACES = [
  ["relaxed", "Relaxed"],
  ["moderate", "Moderate"],
  ["packed", "Packed"],
];

const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map(([val, label]) => (
        <button type="button" key={val} className={value === val ? "active" : ""} onClick={() => onChange(val)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function NewTrip() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    destination: "",
    start_date: addDays(7),
    end_date: addDays(9),
    budget: 20000,
    currency: "INR",
    travelers: 1,
    group_type: "solo",
    travel_style: "balanced",
    pace: "moderate",
    interests: ["Food", "Sightseeing"],
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleInterest = (i) =>
    set("interests", form.interests.includes(i) ? form.interests.filter((x) => x !== i) : [...form.interests, i]);

  const days = form.start_date && form.end_date ? daysBetween(form.start_date, form.end_date) : 0;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (days < 1) return setError("End date must be on or after the start date.");
    if (days > 14) return setError("Trips are limited to 14 days.");
    setLoading(true);
    try {
      const trip = await api.generate({
        ...form,
        budget: Number(form.budget),
        travelers: Number(form.travelers),
        currency: form.currency.toUpperCase(),
        interests: form.interests.map((i) => i.toLowerCase()),
      });
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card center loading-card">
        <div className="spinner" />
        <h2>Building your {days}-day trip to {form.destination}…</h2>
        <p className="muted">The AI is picking places, balancing your budget and ordering the route. This takes 10–30 seconds.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card form-card stack">
      <h1>Plan a new trip</h1>
      <p className="muted">Tell us a bit about the trip and we'll generate a day-by-day plan.</p>

      <label>
        Destination
        <input required placeholder="e.g. Goa, India" value={form.destination} onChange={(e) => set("destination", e.target.value)} />
      </label>

      <div className="grid-3">
        <label>
          Start date
          <input type="date" required min={addDays(0)} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
        </label>
        <label>
          End date
          <input type="date" required min={form.start_date} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
        </label>
        <label>
          Travellers
          <input type="number" min="1" max="50" required value={form.travelers} onChange={(e) => set("travelers", e.target.value)} />
        </label>
      </div>

      <div className="grid-3">
        <label>
          Total budget (whole group)
          <input type="number" min="1" required value={form.budget} onChange={(e) => set("budget", e.target.value)} />
        </label>
        <label>
          Currency
          <select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            {["INR", "USD", "EUR", "GBP", "AED", "SGD", "THB", "JPY"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="muted small field-note">{days > 0 ? `${days} day${days > 1 ? "s" : ""}` : ""}</div>
      </div>

      <div>
        <div className="label">Who's travelling?</div>
        <Segmented options={GROUPS} value={form.group_type} onChange={(v) => set("group_type", v)} />
      </div>
      <div>
        <div className="label">Travel style</div>
        <Segmented options={STYLES} value={form.travel_style} onChange={(v) => set("travel_style", v)} />
      </div>
      <div>
        <div className="label">Pace</div>
        <Segmented options={PACES} value={form.pace} onChange={(v) => set("pace", v)} />
      </div>

      <div>
        <div className="label">Interests</div>
        <div className="chips">
          {INTERESTS.map((i) => (
            <button type="button" key={i} className={`chip chip-btn ${form.interests.includes(i) ? "chip-on" : ""}`} onClick={() => toggleInterest(i)}>
              {i}
            </button>
          ))}
        </div>
      </div>

      <label>
        Anything else? (optional)
        <textarea rows={3} maxLength={500} placeholder="Vegetarian food only, avoid long treks, want a sunset spot…" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>

      {error && <div className="alert alert-error">{error}</div>}
      <button className="btn btn-primary btn-lg">✨ Generate itinerary</button>
    </form>
  );
}
