import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, today, round2, fmtDate, fmtTime, fmtElapsed, isManager } from "../lib/supabase";
import { Card, Row, Select, Label, SectionTitle, btn, btnSm, LiveDot, inputStyle } from "../lib/ui";
import { useAuth } from "../AuthContext";

export const RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "all", label: "All time" },
];
export function inRange(dateish, range) {
  if (range === "all") return true;
  const d = String(dateish).slice(0, 10);
  if (range === "today") return d === today();
  return d >= new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
}

const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const dtStyle = { ...inputStyle, width: "auto", minWidth: 0 };

export default function ShiftClock({ crew, onBack }) {
  const { profile } = useAuth();
  const mgr = isManager(profile.role);
  const [shifts, setShifts] = useState([]);   // all (active = ended_at null)
  const [hours, setHours] = useState([]);     // hour entries (for comparison)
  const [jobSessions, setJobSessions] = useState([]);
  const [tech, setTech] = useState(profile.id);
  const [range, setRange] = useState("today");
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({ started_at: "", ended_at: "" });
  const [addForm, setAddForm] = useState({ tech_id: profile.id, started_at: "", ended_at: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [, tick] = useState(0);

  async function load() {
    const [s, h, j] = await Promise.all([
      supabase.from("shifts").select("*").order("started_at", { ascending: false }).limit(200),
      supabase.from("hour_entries").select("tech_id, work_date, hours"),
      supabase.from("job_sessions").select("*"),
    ]);
    setShifts(s.data || []); setHours(h.data || []); setJobSessions(j.data || []);
  }
  useEffect(() => { load(); }, []);

  const active = shifts.filter((s) => !s.ended_at);
  useEffect(() => {
    if (!active.length && !jobSessions.length) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active.length, jobSessions.length]);

  async function clockIn() {
    if (active.some((s) => s.tech_id === tech)) return;
    const { data, error } = await supabase.from("shifts").insert({ tech_id: tech }).select().single();
    if (!error) setShifts([data, ...shifts]);
  }

  async function clockOut(shift) {
    const now = new Date().toISOString();
    const mine = jobSessions.filter((j) => j.tech_id === shift.tech_id);
    for (const j of mine) {
      const ms = Date.now() - new Date(j.started_at).getTime();
      await supabase.from("hour_entries").insert({
        order_id: j.order_id, tech_id: j.tech_id, work_date: today(),
        hours: Math.max(0.01, round2(ms / 3600000)),
        note: `Clocked session (${fmtElapsed(ms)}) — auto-stopped at end of shift`, clocked: true,
      });
      await supabase.from("job_sessions").delete().eq("id", j.id);
    }
    setJobSessions(jobSessions.filter((j) => j.tech_id !== shift.tech_id));
    await supabase.from("shifts").update({ ended_at: now }).eq("id", shift.id);
    setShifts(shifts.map((s) => (s.id === shift.id ? { ...s, ended_at: now } : s)));
    load();
  }

  function startEdit(s) {
    setEditId(s.id);
    setEditVals({ started_at: toLocalInput(s.started_at), ended_at: toLocalInput(s.ended_at) });
  }
  async function saveEdit(s) {
    const started_at = fromLocalInput(editVals.started_at);
    if (!started_at) return;
    const patch = { started_at, ended_at: editVals.ended_at ? fromLocalInput(editVals.ended_at) : null };
    setEditId(null);
    await supabase.from("shifts").update(patch).eq("id", s.id);
    load();
  }
  async function addShift() {
    const started_at = fromLocalInput(addForm.started_at);
    if (!addForm.tech_id || !started_at) return;
    const ended_at = addForm.ended_at ? fromLocalInput(addForm.ended_at) : null;
    await supabase.from("shifts").insert({ tech_id: addForm.tech_id, started_at, ended_at });
    setAddForm({ tech_id: profile.id, started_at: "", ended_at: "" });
    setShowAdd(false);
    load();
  }

  const nameOf = (id) => crew.find((t) => t.id === id)?.display_name || "—";

  const editor = (s) => (
    <div style={{ padding: "10px 12px", background: "#F6F8F9", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontWeight: 600, color: C.ink, fontFamily: BODY, fontSize: 14, marginBottom: 8 }}>{nameOf(s.tech_id)}</div>
      <Row style={{ flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div><Label>Start</Label><input type="datetime-local" value={editVals.started_at} onChange={(e) => setEditVals({ ...editVals, started_at: e.target.value })} style={dtStyle} /></div>
        <div><Label>End (blank = still on shift)</Label><input type="datetime-local" value={editVals.ended_at} onChange={(e) => setEditVals({ ...editVals, ended_at: e.target.value })} style={dtStyle} /></div>
        <button onClick={() => saveEdit(s)} style={btnSm(C.teal)}>Save</button>
        <button onClick={() => setEditId(null)} style={{ fontSize: 12, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Cancel</button>
      </Row>
    </div>
  );

  const summary = crew.map((t) => {
    let shiftMs = 0;
    for (const s of shifts) {
      if (s.tech_id !== t.id || !inRange(s.started_at, range)) continue;
      shiftMs += (s.ended_at ? new Date(s.ended_at) : Date.now()) - new Date(s.started_at);
    }
    let jobMs = hours.filter((h) => h.tech_id === t.id && inRange(h.work_date, range)).reduce((a, h) => a + Number(h.hours) * 3600000, 0);
    for (const j of jobSessions) if (j.tech_id === t.id && inRange(j.started_at, range)) jobMs += Date.now() - new Date(j.started_at).getTime();
    const util = shiftMs > 0 ? Math.min(999, Math.round((jobMs / shiftMs) * 100)) : null;
    return { id: t.id, name: t.display_name, shiftHrs: round2(shiftMs / 3600000), jobHrs: round2(jobMs / 3600000), util };
  });

  const recent = shifts.filter((s) => s.ended_at).slice(0, 30);

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Shop time clock</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Clocking out of a shift auto-stops and logs any job timers that tech still has running. Shift hours feed payroll.
      </p>

      <div style={{ borderRadius: 6, padding: 12, marginTop: 16, background: C.ink }}>
        {active.length === 0 && <div style={{ fontSize: 13, color: "#7E93A3", fontFamily: BODY, marginBottom: 8 }}>Nobody is on shift right now.</div>}
        {active.map((s) => {
          const onJob = jobSessions.some((j) => j.tech_id === s.tech_id);
          return (
            <Row key={s.id} style={{ marginBottom: 8 }}>
              <LiveDot />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: BODY }}>{nameOf(s.tech_id)}</span>
              <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>{fmtElapsed(Date.now() - new Date(s.started_at).getTime())}</span>
              <span style={{ fontSize: 12, color: "#7E93A3", fontFamily: BODY }}>{onJob ? "on a job" : "not on a job"}</span>
              <Row style={{ marginLeft: "auto", gap: 10 }}>
                {mgr && <button onClick={() => startEdit(s)} style={{ fontSize: 12, fontWeight: 600, color: "#CFE0EA", fontFamily: BODY }}>edit</button>}
                {(mgr || s.tech_id === profile.id) && <button onClick={() => clockOut(s)} style={btnSm(C.orange)}>Clock out</button>}
              </Row>
            </Row>
          );
        })}
        {mgr && editId && active.some((s) => s.id === editId) && (
          <div style={{ borderRadius: 6, overflow: "hidden", marginTop: 4 }}>{editor(active.find((s) => s.id === editId))}</div>
        )}
        <Row>
          <Select value={tech} onChange={(e) => setTech(e.target.value)} style={{ flex: 1, minWidth: 140 }} disabled={!mgr}>
            {crew.filter((t) => mgr || t.id === profile.id).map((t) => (
              <option key={t.id} value={t.id} disabled={active.some((s) => s.tech_id === t.id)}>{t.display_name}</option>
            ))}
          </Select>
          <button onClick={clockIn} disabled={active.some((s) => s.tech_id === tech)} style={btn("#fff", C.ink)}>▶ Start shift</button>
        </Row>
      </div>

      {mgr && (
        <>
          <SectionTitle right={
            <button onClick={() => setShowAdd(!showAdd)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.teal }}>{showAdd ? "Close" : "Add a shift"}</button>
          }>Fix a missed clock-in</SectionTitle>
          {showAdd && (
            <div style={{ borderRadius: 6, border: `1px solid ${C.line}`, padding: 12, background: "#F6F8F9" }}>
              <Row style={{ flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                <div>
                  <Label>Who</Label>
                  <Select value={addForm.tech_id} onChange={(e) => setAddForm({ ...addForm, tech_id: e.target.value })} style={{ width: "auto", minWidth: 140 }}>
                    {crew.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
                  </Select>
                </div>
                <div><Label>Start</Label><input type="datetime-local" value={addForm.started_at} onChange={(e) => setAddForm({ ...addForm, started_at: e.target.value })} style={dtStyle} /></div>
                <div><Label>End (blank = still on)</Label><input type="datetime-local" value={addForm.ended_at} onChange={(e) => setAddForm({ ...addForm, ended_at: e.target.value })} style={dtStyle} /></div>
                <button onClick={addShift} style={btn(C.teal)}>Save shift</button>
              </Row>
            </div>
          )}
        </>
      )}

      <SectionTitle right={
        <Row style={{ gap: 4 }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: range === r.key ? C.teal : "#F1F4F6", color: range === r.key ? "#fff" : C.slate }}>{r.label}</button>
          ))}
        </Row>
      }>Shift time vs job time</SectionTitle>
      <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, padding: "8px 12px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.slate, background: "#F6F8F9", fontFamily: BODY }}>
          <span>Tech</span><span>On shift</span><span>On jobs</span><span>On jobs %</span>
        </div>
        {summary.map((r) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, padding: "8px 12px", fontSize: 14, borderTop: `1px solid ${C.line}`, fontFamily: BODY }}>
            <span style={{ fontWeight: 600, color: C.ink }}>{r.name}{active.some((s) => s.tech_id === r.id) && <span style={{ marginLeft: 6 }}><LiveDot /></span>}</span>
            <span style={{ color: C.ink }}>{r.shiftHrs} hrs</span>
            <span style={{ color: C.teal, fontWeight: 600 }}>{r.jobHrs} hrs</span>
            <span style={{ fontWeight: 700, color: r.util == null ? C.slate : r.util >= 70 ? C.green : r.util >= 40 ? "#B07D0F" : C.red }}>{r.util == null ? "—" : `${r.util}%`}</span>
          </div>
        ))}
      </div>

      <SectionTitle>Recent shifts</SectionTitle>
      {recent.length === 0 ? <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No completed shifts yet.</div> : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {recent.map((s) => (
            editId === s.id ? (
              <div key={s.id}>{editor(s)}</div>
            ) : (
              <Row key={s.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
                <span style={{ fontWeight: 600, color: C.ink }}>{nameOf(s.tech_id)}</span>
                <span style={{ color: C.slate }}>{fmtDate(s.started_at)}</span>
                <span style={{ color: C.slate }}>{fmtTime(s.started_at)} – {fmtTime(s.ended_at)}</span>
                <span style={{ fontWeight: 700, color: C.teal }}>{round2((new Date(s.ended_at) - new Date(s.started_at)) / 3600000)} hrs</span>
                {mgr && (
                  <Row style={{ marginLeft: "auto", gap: 10 }}>
                    <button onClick={() => startEdit(s)} style={{ fontSize: 12, fontWeight: 600, color: C.teal }}>edit</button>
                    <button onClick={async () => { setShifts(shifts.filter((x) => x.id !== s.id)); await supabase.from("shifts").delete().eq("id", s.id); }} style={{ fontSize: 12, color: C.red }}>remove</button>
                  </Row>
                )}
              </Row>
            )
          ))}
        </div>
      )}
    </Card>
  );
}
