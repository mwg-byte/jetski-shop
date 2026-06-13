import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, fmtDate } from "../lib/supabase";
import { Card, Row, TextInput, SectionTitle, btn } from "../lib/ui";
import { useAuth } from "../AuthContext";

export default function ItemRequests({ crew, onBack }) {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", qty: "1", note: "" });
  const [showDone, setShowDone] = useState(false);

  const nameOf = (id) => crew.find((c) => c.id === id)?.display_name || "—";

  async function load() {
    const { data } = await supabase.from("item_requests").select("*").order("created_at", { ascending: false });
    setItems(data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!form.name.trim()) return;
    const { data } = await supabase.from("item_requests").insert({
      requested_by: profile.id, name: form.name.trim(), qty: Number(form.qty) || 1, note: form.note.trim(),
    }).select().single();
    if (data) { setItems([data, ...items]); setForm({ name: "", qty: "1", note: "" }); }
  }
  async function togglePurchased(it) {
    const purchased = !it.purchased;
    setItems(items.map((x) => (x.id === it.id ? { ...x, purchased, purchased_at: purchased ? new Date().toISOString() : null } : x)));
    await supabase.from("item_requests").update({ purchased, purchased_at: purchased ? new Date().toISOString() : null }).eq("id", it.id);
  }
  async function remove(it) {
    setItems(items.filter((x) => x.id !== it.id));
    await supabase.from("item_requests").delete().eq("id", it.id);
  }

  const open = items.filter((x) => !x.purchased);
  const done = items.filter((x) => x.purchased);

  const list = (arr, isDone) => (
    <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
      {arr.map((it) => (
        <Row key={it.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, opacity: isDone ? 0.6 : 1 }}>
          <button onClick={() => togglePurchased(it)} title={isDone ? "Mark not purchased" : "Mark purchased"} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isDone ? C.green : C.line}`, background: isDone ? C.green : "#fff", color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{isDone ? "✓" : ""}</button>
          <span style={{ fontWeight: 600, color: C.ink, textDecoration: isDone ? "line-through" : "none" }}>{it.qty}× {it.name}</span>
          <span style={{ flex: 1, color: C.slate }}>{it.note}</span>
          <span style={{ fontSize: 12, color: C.slate }}>{nameOf(it.requested_by)} · {fmtDate(it.created_at)}</span>
          {(profile.id === it.requested_by || ["owner", "manager"].includes(profile.role)) && (
            <button onClick={() => remove(it)} style={{ fontSize: 12, color: C.red }}>remove</button>
          )}
        </Row>
      ))}
    </div>
  );

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Item requests</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Shop supplies and consumables — WD-40, carb cleaner, rags, etc. Anyone can add to the list; check an item off once it's bought.
      </p>

      <SectionTitle>Request an item</SectionTitle>
      <Row>
        <TextInput placeholder="Item — WD-40, carb cleaner…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ flex: 2, minWidth: 180 }} />
        <TextInput type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} style={{ width: 70 }} />
        <TextInput placeholder="Note (size, brand…)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <button onClick={add} style={btn(C.teal)}>Add</button>
      </Row>

      <SectionTitle>Needs buying ({open.length})</SectionTitle>
      {open.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing on the list — all caught up.</div>
      ) : list(open, false)}

      <SectionTitle right={
        <button onClick={() => setShowDone(!showDone)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.teal }}>{showDone ? "Hide" : "Show"}</button>
      }>Purchased ({done.length})</SectionTitle>
      {showDone && (done.length === 0 ? <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing purchased yet.</div> : list(done, true))}
    </Card>
  );
}