import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { daysBetween, fmtDate, money } from "../utils";

export default function Dashboard() {
  const [trips, setTrips] = useState(null);
  const [error, setError] = useState("");

  const load = () =>
    api
      .listTrips()
      .then(setTrips)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    if (!window.confirm("Delete this trip permanently?")) return;
    try {
      await api.remove(id);
      setTrips((t) => t.filter((x) => x.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = trips ? trips.filter((t) => t.end_date >= today).length : 0;
  const totalDays = trips ? trips.reduce((s, t) => s + daysBetween(t.start_date, t.end_date), 0) : 0;

  return (
    <>
      <div className="row between wrap">
        <div>
          <h1>My trips</h1>
          <p className="muted">Generate, edit and share your AI-built itineraries.</p>
        </div>
        <Link to="/new" className="btn btn-primary">+ Plan a new trip</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats">
        <div className="card stat"><span className="muted small">Total trips</span><strong>{trips ? trips.length : "–"}</strong></div>
        <div className="card stat"><span className="muted small">Upcoming</span><strong>{trips ? upcoming : "–"}</strong></div>
        <div className="card stat"><span className="muted small">Days planned</span><strong>{trips ? totalDays : "–"}</strong></div>
      </div>

      {trips === null && !error && <p className="muted">Loading your trips…</p>}

      {trips && trips.length === 0 && (
        <div className="card empty">
          <h3>No trips yet</h3>
          <p className="muted">Tell us where you want to go and we'll build the plan.</p>
          <Link to="/new" className="btn btn-primary">Create your first trip</Link>
        </div>
      )}

      <div className="grid">
        {trips?.map((t) => (
          <div key={t.id} className="card trip-card">
            <div className="row between">
              <span className="chip">{daysBetween(t.start_date, t.end_date)} days</span>
              {t.is_public && <span className="chip chip-green">Shared</span>}
            </div>
            <h3>{t.title}</h3>
            <p className="muted small">📍 {t.destination}</p>
            <p className="muted small">🗓 {fmtDate(t.start_date)} – {fmtDate(t.end_date)}</p>
            <p className="small">💰 Budget {money(t.budget, t.currency)} · 👥 {t.travelers}</p>
            <div className="row gap">
              <Link to={`/trips/${t.id}`} className="btn btn-primary btn-sm">Open</Link>
              <button className="btn btn-ghost btn-sm" onClick={() => remove(t.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
