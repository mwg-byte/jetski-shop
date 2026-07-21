import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/* ---------- design tokens ---------- */
export const C = {
  ink: "#0C2233", surface: "#EDF1F4", card: "#FFFFFF", orange: "#F4540B",
  teal: "#0E7C86", slate: "#5B6B76", line: "#D6DEE3", paleTeal: "#E3F1F2",
  red: "#B91C1C", green: "#15803D", water: "#0A3540",
};
export const DISPLAY = "'Barlow Condensed', 'Arial Narrow', sans-serif";
export const BODY = "'Inter', system-ui, sans-serif";

export const STAGES = [
  { key: "intake", label: "Intake", color: "#5B6B76" },
  { key: "diagnosing", label: "Diagnosing", color: "#B07D0F" },
  { key: "ready_for_invoice", label: "Ready for Invoice", color: "#2563EB" },
  { key: "awaiting_deposit", label: "Awaiting Deposit", color: "#9333EA" },
  { key: "awaiting_parts", label: "Awaiting Parts", color: "#B45309" },
  { key: "in_repair", label: "In Repair", color: "#0E7C86" },
  { key: "testing", label: "Testing", color: "#4338CA" },
  { key: "ready", label: "Ready for Pickup", color: "#15803D" },
  { key: "closed", label: "Closed", color: "#334155" },
];
export const stageOf = (k) => STAGES.find((s) => s.key === k) || STAGES[0];
export const REPAIR_STATUSES = ["in_repair", "testing"];
export const PART_STATUSES = ["requested", "ordered", "received"];
export const PART_COLORS = { requested: "#B45309", ordered: "#4338CA", received: "#15803D" };
export const TEST_RESULTS = ["pending", "passed", "failed"];
export const TEST_COLORS = { pending: "#B07D0F", passed: "#15803D", failed: "#B91C1C" };

/* ---------- helpers ---------- */
export const today = () => new Date().toISOString().slice(0, 10);
export const round2 = (n) => Math.round(n * 100) / 100;
export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(String(iso).length <= 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const fmtElapsed = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
export function haversine(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const METERS_PER_MILE = 1609.344;
export const isManager = (role) => role === "owner" || role === "manager";
