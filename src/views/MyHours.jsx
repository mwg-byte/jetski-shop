import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, round2, fmtDate, fmtTime, fmtElapsed, isManager } from "../lib/supabase";
import { Card, Row, Select, SectionTitle } from "../lib/ui";
import { useAuth } from "../AuthContext";
import { RANGES, inRange } from "./ShiftClock";

const skiLabel = (o) => {
  if (!o) return "—";
  const ski = [o.year, o.make, o.model].filter(Boolean).join(" ");
  return `${o.customer_name}${ski ? " — " + ski : ""}`;
};

export default function MyHours({ crew, orders, onBack }) {
  const { profile } = useAuth();
  const mgr = isManager(profile.role);
  const [who, setWho] = useState(profile.id);
  const [range, setRange] = useState("7d");
  const [shifts, setShifts] = useState([]);
  const [hours, setHours] = useState([]);
  const [lake, setLake] = useState([]);
  const [trips, setTrips] = useState([]);

  async function load() {
    const [s, h, l, t] = await Promise.all([
      supabase.from("shifts").select("*").eq("tech_id", who).order("started_at", { ascending: false }),
      supabase.from("hour_entries").select("*").eq("tech_id", who).order("work_date", { ascending: false }),
      supabase.from("lake_tests").select("*").eq("tech_id", who).order("test_date", { ascending: false }),
      supabase.from("trips").select("*").eq("tech_id", who).order("trip_date", { ascending: false }),
    ]);
    setShifts(s.data || []); setHours(h.data || []); setLake(l.data || []); setTrips(t.data || []);
  }
  useEffect(() => { load(); }, [who]);

  const orderOf = (id) => orders.find((o) => o.id === id);

  const shiftRows = shifts.filter((s) => s.ended_at && inRange(s.started_at, range));
  const shiftHrs = round2(shiftRows.reduce((a, s) => a + (new Date(s.ended_at) - new Date(s.started_at)) / 3600000, 0));
  const hourRows = hours.filter((h) => inRange(h.work_date, range));
  const jobHrs = round2(hourRows.reduce((a, h) => a + Number(h.hours), 0));
  const lakeRows = lake.filter((l) => inRange(l.test_date, range));
  const lakeHrs = round2(lakeRows.reduce((a, l) => a + l.seconds, 0) / 3600);
  const tripRows = trips.filter((t) => inRange(t.trip_date, range));
  const miles = round2(tripRows.reduce((a, t) => a + Number(t.miles), 0));

  const me = crew.find((c) => c.id === who);
  const TEST_COLOR = { pending: C.slate, passed: C.green, failed: C.red };

  const stat = (label, value, unit, color) => (
    <div style={{ flex: 1, minWidth: 120, borderRadius: 6, border: `1px solid ${C.line}`, padding: "12px 14px", background: "#F6F8F9" }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.slate, fontFamily: BODY }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color, marginTop: 2 }}>{value}<span style={{ fontSize: 13, fontWeight: 600, color: C.slate, marginLeft: 4 }}>{unit}</span></div>
    </div>
  );

  const rangeBtns = (
    <Row style={{ gap: 4 }}>
      {RANGES.map((r) => (
        <button key={r.key} onClick={() => setRange(r.key)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: range === r.key ? C.teal : "#F1F4F6", color: range === r.key ? "#fff" : C.slate }}>{r.label}</button>
      ))}
    </Row>
  );

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>
        {who === profile.id ? "My hours" : `${me?.display_name || "Crew"} — hours`}
      </h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Your shop shifts, job time, lake testing, and mileage. Pick a date range to total it up.
      </p>

      {mgr && (
        <Row style={{ marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Viewing</span>
          <Select value={who} onChange={(e) => setWho(e.target.value)} style={{ minWidth: 160 }}>
            {crew.map((c) => <option key={c.id} value={c.id}>{c.display_name}{c.id === profile.id ? " (me)" : ""}</option>)}
          </Select>
        </Row>
      )}

      <SectionTitle right={rangeBtns}>Totals</SectionTitle>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {stat("On shift", shiftHrs, "hrs", C.ink)}
        {stat("Job time", jobHrs, "hrs", C.teal)}
        {stat("Lake testing", lakeHrs, "hrs", C.water)}
        {stat("Mileage", miles, "mi", C.orange)}
      </div>

      <SectionTitle>Shifts</SectionTitle>
      {shiftRows.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No shifts in this range.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {shiftRows.map((s) => (
            <Row key={s.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ color: C.slate }}>{fmtDate(s.started_at)}</span>
              <span style={{ color: C.slate }}>{fmtTime(s.started_at)} – {fmtTime(s.ended_at)}</span>
              <span style={{ marginLeft: "auto", fontWeight: 700, color: C.teal }}>{round2((new Date(s.ended_at) - new Date(s.started_at)) / 3600000)} hrs</span>
            </Row>
          ))}
        </div>
      )}

      <SectionTitle>Job time</SectionTitle>
      {hourRows.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No job hours in this range.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {hourRows.map((h) => (
            <Row key={h.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ color: C.slate, minWidth: 70 }}>{fmtDate(h.work_date)}</span>
              <span style={{ color: C.ink, fontWeight: 600 }}>{skiLabel(orderOf(h.order_id))}</span>
              {h.note ? <span style={{ color: C.slate, fontSize: 12 }}>{h.note}</span> : null}
              <span style={{ marginLeft: "auto", fontWeight: 700, color: C.teal }}>{round2(Number(h.hours))} hrs</span>
            </Row>
          ))}
        </div>
      )}

      <SectionTitle>Lake testing</SectionTitle>
      {lakeRows.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No lake tests in this range.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {lakeRows.map((l) => (
            <Row key={l.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ color: C.slate, minWidth: 70 }}>{fmtDate(l.test_date)}</span>
              <span style={{ color: C.ink, fontWeight: 600 }}>{skiLabel(orderOf(l.order_id))}</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: TEST_COLOR[l.result] || C.slate }}>{l.result}</span>
              <span style={{ marginLeft: "auto", fontWeight: 700, color: C.teal }}>{fmtElapsed(l.seconds * 1000)}</span>
            </Row>
          ))}
        </div>
      )}

      <SectionTitle>Mileage</SectionTitle>
      {tripRows.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No trips in this range.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {tripRows.map((t) => (
            <Row key={t.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ color: C.slate, minWidth: 70 }}>{fmtDate(t.trip_date)}</span>
              {t.purpose ? <span style={{ color: C.ink }}>{t.purpose}</span> : <span style={{ color: C.slate }}>{t.method === "gps" ? "GPS trip" : "Manual trip"}</span>}
              <span style={{ marginLeft: "auto", fontWeight: 700, color: C.orange }}>{round2(Number(t.miles))} mi</span>
            </Row>
          ))}
        </div>
      )}
    </Card>
  );
}
