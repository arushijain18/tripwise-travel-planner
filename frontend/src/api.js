import { supabase } from "./supabaseClient";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail)) msg = j.detail.map((d) => d.msg).join("; ");
    } catch {
      /* keep statusText */
    }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  listTrips: () => request("/api/trips"),
  getTrip: (id) => request(`/api/trips/${id}`),
  getShared: (id) => request(`/api/shared/${id}`, { auth: false }),
  generate: (payload) => request("/api/trips/generate", { method: "POST", body: payload }),
  update: (id, payload) => request(`/api/trips/${id}`, { method: "PUT", body: payload }),
  remove: (id) => request(`/api/trips/${id}`, { method: "DELETE" }),
  regenerateDay: (id, day, instruction) =>
    request(`/api/trips/${id}/regenerate-day`, { method: "POST", body: { day, instruction } }),
  share: (id, is_public) => request(`/api/trips/${id}/share`, { method: "POST", body: { is_public } }),
};
