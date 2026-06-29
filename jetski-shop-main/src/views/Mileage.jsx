import { useState, useEffect, useRef } from "react";
import { supabase, C, DISPLAY, BODY, today, round2, fmtDate, fmtElapsed, haversine, METERS_PER_MILE, isManager } from "../lib/supabase";
import { Card, Row, TextInput, Select, Label, SectionTitle, btn, btnSm, LiveDot } from "../lib/ui";
import { useAuth } from "../AuthContext";
import { RANGES, inRange } from "./ShiftClock";

export default function Mileage({ crew, settings, onBack }) {
  const { profile } = useAuth();
  const mgr = isManager(profile.role);
  const rate = settings?.mileage_rate ?? 0.7;
  const [trips, setTrips] = useState([]);
  const [trip, setTrip] = useState(null);
  const [purpose, setPurpose] = useState("");
  const [manual, setManual] = useState({ trip_date: today(), miles: "", purpose: "" });
  const [range, setRange] = useState("7d");
  const [gpsErr, setGpsErr] = useState("");
  const [, tick] = useState(0);
  const tripRef = useRef(null);
  tripRef.current = trip;

  useEffect(() => {
    supabase.from("trips").select("*").order("trip_date", { ascending: false }).limit(200)
      .then(({ data }) => setTrips(data || []));
    return () => { if (tripRef.current?.watchId != null) navigator.geolocation?.clearWatch(tripRef.current.watchId); };
  }, []);

  useEffect(() => {
    if (!trip) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [!!trip]);

  function startTrip() {
    setGpsErr("");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        if (accuracy > 60) return;
        setTrip((t) => {
          if (!t) return t;
          if (!t.last) return { ...t, last: { lat, lon, time: pos.timestamp } };
          const m = haversine(t.last, { lat, lon });
          const sec = Math.max(0.5, (pos.timestamp - t.last.time) / 1000);
          if (m / sec > 60) return t;       // GPS jump
          if (m < 3) return t;              // standing still
          return { ...t, meters: t.meters + m, last: { lat, lon, time: pos.timestamp } };
        });
      },
      (err) => {
        setGpsErr(err.code === 1 ? "Location permission denied — log the trip manually below." : "No GPS fix — log the trip manually below.");
        setTrip((t) => { if (t?.watchId != null) navigator.geolocation.clearWatch(t.watchId); return null; });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    setTrip({ startedAt: Date.now(), meters: 0, last: null, watchId, purpose: purpose.trim() });
  }

  async function endTrip() {
    if (trip.watchId != null) navigator.geolocation.clearWatch(trip.watchId);
    const miles = round2(trip.meters / METERS_PER_MILE);
    if (miles > 0) {
      const { data } = await supabase.from("trips").insert({ tech_id: profile.id, miles, purpose: trip.purpose, method: "gps" }).select().single();
      if (data) setTrips([data, ...trips]);
    } else setGpsErr("No distance recorded — nothing saved. Log the miles manually if GPS was spotty.");
    setTrip(null);
  }

  async function addManual() {
    const miles = Number(manual.miles);
    if (!miles || miles <= 0) return;
    const { data } = await supabase.from("trips").insert({ tech_id: profile.id, trip_date: manual.trip_date, miles: round2(miles), purpose: manual.purpose.trim(), method: "manual" }).select().single();
    if (data) { setTrips([data, ...trips]); setManual({ ...manual, miles: "", purpose: "" }); }
  }

  const nameOf = (id) => crew.find((t) => t.id === id)?.display_name || "—";
  const visibleCrew = mgr ? crew : crew.filter((t) => t.id === profile.id);
  const summary = visibleCrew.map((t) => {
    const miles = round2(trips.filter((x) => x.tech_id === t.id && inRange(x.trip_date, range)).reduce((s, x) => s + Number(x.miles), 0));
    return { id: t.id, name: t.display_name, miles, owed: round2(miles * rate) };
  });

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Mileage</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        GPS tracking needs this page kept open with location allowed. Reimbursements flow into payroll automatically at ${rate}/mile.
      </p>

      <div style={{ borderRadius: 6, padding: 12, marginTop: 16, background: C.ink }}>
        {trip ? (
          <Row>
            <LiveDot color="#38BDF8" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: BODY }}>{profile.display_name}{trip.purpose ? ` · ${trip.purpose}` : ""}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color: "#fff" }}>{round2(trip.meters / METERS_PER_MILE)} mi</span>
            <span style={{ fontSize: 12, color: "#7E93A3", fontFamily: BODY }}>{fmtElapsed(Date.now() - trip.startedAt)}{!trip.last ? " · waiting for GPS fix…" : ""}</span>
            <button onClick={endTrip} style={{ ...btnSm(C.orange), marginLeft: "auto" }}>■ End trip</button>
          </Row>
        ) : (
          <Row>
            <TextInput value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose — parts run, lake tow…" style={{ flex: 1, minWidth: 180 }} />
            <button onClick={startTrip} disabled={!navigator.geolocation} style={btn("#fff", C.ink)}>▶ Start GPS trip</button>
          </Row>
        )}
      </div>
      {gpsErr && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY, marginTop: 6 }}>{gpsErr}</div>}

      <SectionTitle>Log a trip manually</SectionTitle>
      <Row>
        <TextInput type="date" value={manual.trip_date} onChange={(e) => setManual({ ...manual, trip_date: e.target.value })} style={{ width: "auto" }} />
        <TextInput type="number" step="0.1" min="0" placeholder="Miles" value={manual.miles} onChange={(e) => setManual({ ...manual, miles: e.target.value })} style={{ width: 100 }} />
        <TextInput placeholder="Purpose" value={manual.purpose} onChange={(e) => setManual({ ...manual, purpose: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
        <button onClick={addManual} style={btn(C.teal)}>Log trip</button>
      </Row>

      <SectionTitle right={
        <Row style={{ gap: 4 }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: range === r.key ? C.teal : "#F1F4F6", color: range === r.key ? "#fff" : C.slate }}>{r.label}</button>
          ))}
        </Row>
      }>Reimbursement</SectionTitle>
      <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, padding: "8px 12px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: C.slate, background: "#F6F8F9", fontFamily: BODY }}>
          <span>Driver</span><span>Miles</span><span>Owed</span>
        </div>
        {summary.map((r) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, padding: "8px 12px", fontSize: 14, borderTop: `1px solid ${C.line}`, fontFamily: BODY }}>
            <span style={{ fontWeight: 600, color: C.ink }}>{r.name}</span>
            <span>{r.miles} mi</span>
            <span style={{ fontWeight: 700, color: C.green }}>${r.owed.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <SectionTitle>Recent trips</SectionTitle>
      {trips.length === 0 ? <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No trips logged yet.</div> : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {trips.slice(0, 30).map((t) => (
            <Row key={t.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ fontWeight: 600, color: C.ink }}>{nameOf(t.tech_id)}</span>
              <span style={{ color: C.slate }}>{fmtDate(t.trip_date)}</span>
              <span style={{ fontWeight: 700, color: C.teal }}>{t.miles} mi</span>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 999, background: t.method === "gps" ? "#E0F2FE" : "#F1F4F6", color: t.method === "gps" ? "#0369A1" : C.slate }}>{t.method}</span>
              <span style={{ flex: 1, color: C.slate }}>{t.purpose}</span>
              <span style={{ fontWeight: 600, color: C.green }}>${round2(t.miles * rate).toFixed(2)}</span>
              {(mgr || t.tech_id === profile.id) && <button onClick={async () => { setTrips(trips.filter((x) => x.id !== t.id)); await supabase.from("trips").delete().eq("id", t.id); }} style={{ fontSize: 12, color: C.red }}>remove</button>}
            </Row>
          ))}
        </div>
      )}
    </Card>
  );
}
