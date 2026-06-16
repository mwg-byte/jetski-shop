import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, fmtDate } from "../lib/supabase";
import { Card, Row, TextInput, SectionTitle, btn } from "../lib/ui";
import { useAuth } from "../AuthContext";

const DAY = 86400000;
function weekStart(d) {
  const date = new Date(typeof d === "string" ? d + "T12:00:00" : d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function ItemsTaken({ crew, onBack }) {
  const { profile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ name: "", qty: "1", note: "" });
  const thisWeek = weekStart(new Date());
  const [week, setWeek] = useState(thisWeek);

  const nameOf = (id) => crew.find((c) => c.id === id)?.display_name || "—";
  const canRemove = (it) => it.taken_by === profile.id || ["owner", "manager"].includes(profile.role);

  async function load() {
    const { data } = await supabase.from("consumables_taken").select("*").order("created_at", { ascending: false });
    setLogs(data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!form.name.trim()) return;
    const { data } = await supabase.from("consumables_taken").insert({
      taken_by: profile.id, name: form.name.trim(), qty: Number(form.qty) || 1, note: form.note.trim(),
    }).select().single();
    if (data) { setLogs([data, ...logs]); setForm({ name: "", qty: "1", note: "" }); }
  }
  async function remove(it) {
    setLogs(logs.filter((x) => x.id !== it.id));
    await supabase.from("consumables_taken").delete().eq("id", it.id);
  }

  const wkStartMs = new Date(week + "T00:00:00").getTime();
  const wkEndMs = wkStartMs + 7 * DAY;
  const inWeek = (val) => { const t = new Date(val).getTime(); return t >= wkStartMs && t < wkEndMs; };
  const isThisWeek = week === thisWeek;
  const weekLabel = `${fmtDate(week)} – ${fmtDate(addDays(week, 6))}`;
  const wkLogs = logs.filter((l) => inWeek(l.created_at));
  const wkQty = wkLogs.reduce((a, l) => a + Number(l.qty), 0);

  const navBtn = (label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 6, background: "#F1F4F6", color: disabled ? "#B7C2CA" : C.ink, opacity: disabled ? 0.6 : 1 }}>{label}</button>
  );

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Items taken</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Log shop consumables pulled off the shelf — oil, rags, WD-40, zip ties, etc. Quick way to track what's getting used up.
      </p>

      <SectionTitle>Log an item taken</SectionTitle>
      <Row>
        <TextInput placeholder="Item — 2-stroke oil, shop rags…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ flex: 2, minWidth: 180 }} />
        <TextInput type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} style={{ width: 70 }} />
        <TextInput placeholder="Note (size, what for…)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <button onClick={add} style={btn(C.teal)}>Log it</button>
      </Row>

      <SectionTitle right={
        <Row style={{ gap: 6 }}>
          {navBtn("‹ Prev", () => setWeek(addDays(week, -7)), false)}
          {!isThisWeek && navBtn("This week", () => setWeek(thisWeek), false)}
          {navBtn("Next ›", () => setWeek(addDays(week, 7)), isThisWeek)}
        </Row>
      }>Taken · {weekLabel}</SectionTitle>
      <div style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginBottom: 6 }}>{wkLogs.length} entries · {wkQty} items taken this week</div>
      {wkLogs.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing logged this week.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {wkLogs.map((it) => (
            <Row key={it.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ color: C.slate, minWidth: 60 }}>{fmtDate(it.created_at)}</span>
              <span style={{ fontWeight: 600, color: C.ink }}>{it.qty}× {it.name}</span>
              <span style={{ flex: 1, color: C.slate }}>{it.note}</span>
              <span style={{ fontSize: 12, color: C.slate }}>{nameOf(it.taken_by)}</span>
              {canRemove(it) && <button onClick={() => remove(it)} style={{ fontSize: 12, color: C.red }}>remove</button>}
            </Row>
          ))}
        </div>
      )}
    </Card>
  );
}
