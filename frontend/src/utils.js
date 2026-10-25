export function money(amount, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount || 0);
  } catch {
    return `${currency} ${Math.round(amount || 0)}`;
  }
}

export function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function daysBetween(start, end) {
  return Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
}

// Same formula as the backend: all activity costs + nights x first accommodation price.
export function computeTotals(itinerary) {
  const days = itinerary?.days || [];
  const byType = { food: 0, transport: 0, attraction: 0, activity: 0 };
  days.forEach((d) =>
    (d.activities || []).forEach((a) => {
      byType[a.type] = (byType[a.type] || 0) + (Number(a.cost) || 0);
    })
  );
  const nightly = Number(itinerary?.accommodation?.[0]?.price_per_night) || 0;
  const stay = nightly * Math.max(days.length - 1, 0);
  const total = Object.values(byType).reduce((s, v) => s + v, 0) + stay;
  return { byType, stay, total };
}

export const dayCost = (day) => (day.activities || []).reduce((s, a) => s + (Number(a.cost) || 0), 0);
