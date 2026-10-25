import { useState } from "react";
import { computeTotals, dayCost, fmtDate, money } from "../utils";

const TYPES = ["attraction", "food", "transport", "activity"];
const ICON = { attraction: "🏛️", food: "🍽️", transport: "🚕", activity: "🎯" };

export default function ItineraryView({ itinerary, currency, budget, editable, onChange, onRegenerateDay, busyDay }) {
  const [instructions, setInstructions] = useState({});
  const days = itinerary.days || [];
  const totals = computeTotals(itinerary);
  const overBudget = budget && totals.total > budget;

  const mutate = (fn) => {
    const next = structuredClone(itinerary);
    fn(next);
    onChange(next);
  };
  const setActivity = (di, ai, patch) => mutate((it) => Object.assign(it.days[di].activities[ai], patch));
  const removeActivity = (di, ai) => mutate((it) => it.days[di].activities.splice(ai, 1));
  const addActivity = (di) =>
    mutate((it) =>
      it.days[di].activities.push({ time: "12:00", title: "New activity", description: "", type: "activity", location: "", cost: 0 })
    );

  return (
    <div className="stack">
      {itinerary.summary && <p className="summary">{itinerary.summary}</p>}

      <div className="stats">
        <div className="card stat">
          <span className="muted small">Estimated total</span>
          <strong className={overBudget ? "danger" : ""}>{money(totals.total, currency)}</strong>
          {budget ? <span className="muted small">of {money(budget, currency)} budget</span> : null}
        </div>
        <div className="card stat"><span className="muted small">Food</span><strong>{money(totals.byType.food, currency)}</strong></div>
        <div className="card stat"><span className="muted small">Stay</span><strong>{money(totals.stay, currency)}</strong></div>
        <div className="card stat"><span className="muted small">Transport</span><strong>{money(totals.byType.transport, currency)}</strong></div>
        <div className="card stat">
          <span className="muted small">Sights & activities</span>
          <strong>{money(totals.byType.attraction + totals.byType.activity, currency)}</strong>
        </div>
      </div>
      {overBudget && <div className="alert alert-error">This plan is above your budget. Edit costs or regenerate a day with "make it cheaper".</div>}

      {days.map((day, di) => (
        <section key={di} className="card day">
          <div className="day-head">
            <div>
              <span className="chip">Day {day.day}</span>
              <h2>{day.theme}</h2>
              <span className="muted small">{fmtDate(day.date)} · {money(dayCost(day), currency)}</span>
            </div>
            {editable && (
              <div className="regen no-print">
                <input
                  placeholder='e.g. "more relaxed, add a beach"'
                  value={instructions[di] || ""}
                  onChange={(e) => setInstructions({ ...instructions, [di]: e.target.value })}
                  disabled={busyDay !== null}
                />
                <button className="btn btn-ghost btn-sm" disabled={busyDay !== null} onClick={() => onRegenerateDay(day.day, instructions[di] || "")}>
                  {busyDay === day.day ? "Regenerating…" : "↻ Regenerate day"}
                </button>
              </div>
            )}
          </div>

          <ul className="timeline">
            {day.activities.map((a, ai) => (
              <li key={ai} className={`act act-${a.type}`}>
                {editable ? (
                  <div className="act-edit">
                    <input className="w-time" value={a.time} onChange={(e) => setActivity(di, ai, { time: e.target.value })} />
                    <input className="grow" value={a.title} onChange={(e) => setActivity(di, ai, { title: e.target.value })} />
                    <select value={a.type} onChange={(e) => setActivity(di, ai, { type: e.target.value })}>
                      {TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <input className="w-cost" type="number" min="0" value={a.cost} onChange={(e) => setActivity(di, ai, { cost: Number(e.target.value) || 0 })} />
                    <button className="btn btn-ghost btn-sm" title="Remove" onClick={() => removeActivity(di, ai)}>✕</button>
                    <textarea className="full" rows={2} value={a.description} onChange={(e) => setActivity(di, ai, { description: e.target.value })} />
                  </div>
                ) : (
                  <>
                    <div className="time">{a.time}</div>
                    <div className="act-body">
                      <div className="row between">
                        <strong>{ICON[a.type]} {a.title}</strong>
                        <span className="muted small">{a.cost ? money(a.cost, currency) : "Free"}</span>
                      </div>
                      {a.location && <div className="muted small">📍 {a.location}</div>}
                      {a.description && <p>{a.description}</p>}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <button className="btn btn-ghost btn-sm no-print" onClick={() => addActivity(di)}>+ Add activity</button>
          )}
        </section>
      ))}

      {itinerary.accommodation?.length > 0 && (
        <section className="card">
          <h2>🏨 Where to stay</h2>
          <div className="grid">
            {itinerary.accommodation.map((s, i) => (
              <div key={i} className="sub-card">
                <strong>{s.name}</strong>
                <div className="muted small">{s.area} · {money(s.price_per_night, currency)}/night</div>
                <p>{s.why}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(itinerary.transport?.getting_there || itinerary.transport?.local) && (
        <section className="card">
          <h2>🚆 Getting around</h2>
          {itinerary.transport.getting_there && <p><strong>Getting there:</strong> {itinerary.transport.getting_there}</p>}
          {itinerary.transport.local && <p><strong>Local travel:</strong> {itinerary.transport.local}</p>}
        </section>
      )}

      {itinerary.tips?.length > 0 && (
        <section className="card">
          <h2>💡 Tips</h2>
          <ul>{itinerary.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
