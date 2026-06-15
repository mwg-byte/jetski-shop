import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, fmtDate, PART_STATUSES, PART_COLORS } from "../lib/supabase";
import { Card, Row, TextInput, SectionTitle, btn } from "../lib/ui";
import { useAuth } from "../AuthContext";

const skiLabel = (o) => {
  if (!o) return "Unknown order";
  const ski = [o.year, o.make, o.model].filter(Boolean).join(" ");
  return `${o.customer_name}${ski ? " — " + ski : ""}`;
};

export default function ItemRequests({ crew, onBack }) {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ name: "", qty: "1", note: "" });
  const [showDone, setShowDone] = useState(false);
  const [showRecv, setShowRecv] = useState(false);

  const nameOf = (id) => crew.find((c) => c.id === id)?.display_name || "—";
  const orderOf = (id) => orders.find((o) => o.id === id);

  async function load() {
    const [{ data: ir }, { data: pr }, { data: wo }] = await Promise.all([
      supabase.from("item_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("parts").select("*").eq("kind", "request").order("created_at", { ascending: false }),
      supabase.from("work_orders").select("id, customer_name, make, model, year"),
    ]);
    setItems(ir || []); setReqs(pr || []); setOrders(wo || []);
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
  async function cycleReq(p) {
    const status = PART_STATUSES[(PART_STATUSES.indexOf(p.status) + 1) % PART_STATUSES.length];
    setReqs(reqs.map((x) => (x.id === p.id ? { ...x, status } : x)));
    await supabase.from("parts").update({ status }).eq("id", p.id);
  }

  const open = items.filter((x) => !x.purchased);
  const done = items.filter((x) => x.purchased);
  const openReqs = reqs.filter((p) => p.status !== "received");
  const recvReqs = reqs.filter((p) => p.status === "received");

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

  const reqList = (arr) => (
    <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
      {arr.map((p) => (
        <Row key={p.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, flexWrap: "wrap", gap: 8, opacity: p.status === "received" ? 0.6 : 1 }}>
          <span style={{ fontWeight: 600, color: C.ink }}>{p.qty}× {p.name}</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: C.paleTeal, color: C.teal, whiteSpace: "nowrap" }}>{skiLabel(orderOf(p.order_id))}</span>
          <span style={{ flex: 1, minWidth: 80, color: C.slate }}>{p.note}</span>
          <button onClick={() => cycleReq(p)} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999, background: PART_COLORS[p.status] + "1A", color: PART_COLORS[p.status] }}>{p.status}</button>
        </Row>
      ))}
    </div>
  );

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Item requests</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Shop supplies and consumables, plus parts requested on work orders — everything that needs buying, in one place.
      </p>

      <SectionTitle>Request an item</SectionTitle>
      <Row>
        <TextInput placeholder="Item — WD-40, carb cleaner…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ flex: 2, minWidth: 180 }} />
        <TextInput type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} style={{ width: 70 }} />
        <TextInput placeholder="Note (size, brand…)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <button onClick={add} style={btn(C.teal)}>Add</button>
      </Row>

      <SectionTitle>Parts requested on work orders ({openReqs.length})</SectionTitle>
      {openReqs.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No open parts requests from work orders.</div>
      ) : reqList(openReqs)}
      {recvReqs.length > 0 && (
        <>
          <SectionTitle right={
            <button onClick={() => setShowRecv(!showRecv)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.teal }}>{showRecv ? "Hide" : "Show"}</button>
          }>Received parts ({recvReqs.length})</SectionTitle>
          {showRecv && reqList(recvReqs)}
        </>
      )}

      <SectionTitle>Shop items · needs buying ({open.length})</SectionTitle>
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
