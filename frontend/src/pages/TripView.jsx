import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import ItineraryView from "../components/ItineraryView";
import { fmtDate, money } from "../utils";

export default function TripView({ shared = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyDay, setBusyDay] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = shared ? api.getShared(id) : api.getTrip(id);
    load
      .then((t) => {
        setTrip(t);
        setDraft(t.itinerary);
      })
      .catch((e) => setError(e.message));
  }, [id, shared]);

  const applyTrip = (t) => {
    setTrip(t);
    setDraft(t.itinerary);
    setDirty(false);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      applyTrip(await api.update(id, { itinerary: draft }));
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const regenerateDay = async (day, instruction) => {
    setError("");
    setBusyDay(day);
    try {
      if (dirty) await save(); // the server regenerates from the saved version, so save first
      applyTrip(await api.regenerateDay(id, day, instruction));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyDay(null);
    }
  };

  const toggleShare = async () => {
    try {
      applyTrip(await api.share(id, !trip.is_public));
    } catch (e) {
      setError(e.message);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/shared/${trip.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const remove = async () => {
    if (!window.confirm("Delete this trip permanently?")) return;
    await api.remove(id);
    navigate("/");
  };

  if (error && !trip) {
    return (
      <div className="card center">
        <h2>Couldn't load this trip</h2>
        <p className="muted">{error}</p>
        <Link to="/" className="btn btn-primary">Back to dashboard</Link>
      </div>
    );
  }
  if (!trip) return <p className="muted">Loading trip…</p>;

  return (
    <>
      <div className="row between wrap trip-header">
        <div>
          <span className="chip">{shared ? "Shared itinerary" : "Your itinerary"}</span>
          <h1>{trip.title}</h1>
          <p className="muted">
            📍 {trip.destination} · 🗓 {fmtDate(trip.start_date)} – {fmtDate(trip.end_date)} · 👥 {trip.travelers} ·
            💰 {money(trip.budget, trip.currency)}
          </p>
        </div>

        {!shared && (
          <div className="row gap wrap no-print">
            {editing ? (
              <>
                <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => save().catch(() => {})}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setDraft(trip.itinerary);
                    setDirty(false);
                    setEditing(false);
                  }}
                >
                  {dirty ? "Discard" : "Done"}
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={() => setEditing(true)}>✏️ Edit</button>
            )}
            <button className="btn btn-ghost" onClick={() => window.print()}>🖨 Print / PDF</button>
            <button className="btn btn-ghost" onClick={remove}>Delete</button>
          </div>
        )}
        {shared && (
          <button className="btn btn-ghost no-print" onClick={() => window.print()}>🖨 Print / PDF</button>
        )}
      </div>

      {!shared && (
        <div className="card share-bar no-print">
          <div>
            <strong>Share with your travel buddies</strong>
            <div className="muted small">
              {trip.is_public ? "Anyone with the link can view this plan (read-only)." : "Sharing is off. Only you can see this trip."}
            </div>
          </div>
          <div className="row gap">
            {trip.is_public && <button className="btn btn-ghost btn-sm" onClick={copyLink}>{copied ? "Copied ✓" : "Copy link"}</button>}
            <button className="btn btn-primary btn-sm" onClick={toggleShare}>{trip.is_public ? "Turn off sharing" : "Turn on sharing"}</button>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <ItineraryView
        itinerary={draft}
        currency={trip.currency}
        budget={trip.budget}
        editable={!shared && editing}
        onChange={(next) => {
          setDraft(next);
          setDirty(true);
        }}
        onRegenerateDay={regenerateDay}
        busyDay={busyDay}
      />

      {!shared && !editing && (
        <p className="muted small center no-print">Tip: click “Edit” to change activities or regenerate any single day with the AI.</p>
      )}
    </>
  );
}
