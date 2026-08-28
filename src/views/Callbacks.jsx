import { useState, useEffect, useMemo } from "react";
import { supabase, C, DISPLAY, BODY, fmtDate } from "../lib/supabase";
import { Card, Row, TextInput, Select, Label, SectionTitle, btn, btnSm } from "../lib/ui";
import { useAuth } from "../AuthContext";

const todayIso = () => new Date().toISOString().slice(0, 10);
const orderLabel = (o) => {
  if (!o) return "";
  const ski = [o.year, o.make, o.model].filter(Boolean).join(" ");
  return `${o.customer_name}${ski ? " — " + ski : ""}`;
};

export default function Callbacks({ crew = [], orders = [], onCountChange, onOpen, onBack }) {
  const { profile } = useAuth();
  const isMgr = ["owner", "manager"].includes(profile.role);
  const [rows, setRows] = useState([]);
  const [showDone, setShowDone] = useState(false);
  const [f, setF] = useState({ customer_name: "", phone: "", reason: "", due_date: "", order_id: "" });

  const nameOf = (id) => crew.find((c) => c.id === id)?.display_name || "—";
  const orderOf = (id) => orders.find((o) => o.id === id);

  async function load() {
    const { data } = await supabase.from("callbacks").select("*").order("due_date", { nullsFirst: false });
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!f.customer_name.trim() && !f.order_id) return;
    const linked = orderOf(f.order_id);
    const payload = {
      created_by: profile.id,
      customer_name: (f.customer_name.trim() || (linked ? linked.customer_name : "")),
      phone: (f.phone.trim() || (linked ? linked.customer_phone : "") || ""),
      reason: f.reason.trim(),
      due_date: f.due_date || null,
      order_id: f.order_id || null,
    };
    const { data } = await supabase.from("callbacks").insert(payload).select().single();
    if (data) {
      setRows([data, ...rows]);
      setF({ customer_name: "", phone: "", reason: "", due_date: "", order_id: "" });
      onCountChange && onCountChange();
    }
  }
  async function toggleDone(c) {
    const done = !c.done;
    const done_at = done ? new Date().toISOString() : null;
    setRows(rows.map((x) => (x.id === c.id ? { ...x, done, done_at } : x)));
    await supabase.from("callbacks").update({ done, done_at }).eq("id", c.id);
    onCountChange && onCountChange();
  }
  async function remove(c) {
    setRows(rows.filter((x) => x.id !== c.id));
    await supabase.from("callbacks").delete().eq("id", c.id);
    onCountChange && onCountChange();
  }
  // When you attach to a work order, prefill the customer/phone from it.
  function pickOrder(id) {
    const o = orderOf(id);
    setF((s) => ({ ...s, order_id: id, customer_name: s.customer_name || (o ? o.customer_name : ""), phone: s.phone || (o ? o.customer_phone : "") || "" }));
  }

  const open = useMemo(() => rows.filter((c) => !c.done).sort((a, b) => {
    if (!a.due_date && !b.due_date) return a.created_at < b.created_at ? 1 : -1;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }), [rows]);
  const done = useMemo(() => rows.filter((c) => c.done).sort((a, b) => (a.done_at < b.done_at ? 1 : -1)), [rows]);
  const t = todayIso();

  const dueChip = (c) => {
    if (!c.due_date) return null;
    const d = String(c.due_date).slice(0, 10);
    const overdue = d < t, todayDue = d === t;
    const col = overdue ? C.red : todayDue ? C.orange : C.teal;
    const label = overdue ? `Overdue · ${fmtDate(d)}` : todayDue ? "Due today" : `Due ${fmtDate(d)}`;
    return <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999, background: col + "1A", color: col }}>{label}</span>;
  };

  const rowUi = (c, isDone) => {
    const phone = (c.phone || "").replace(/[^\d+]/g, "");
    const linked = orderOf(c.order_id);
    return (
      <Row key={c.id} style={{ padding: "10px 12px", borderBottom: `1px solid ${C.line}`, fontFamily: BODY, gap: 8, flexWrap: "wrap", opacity: isDone ? 0.6 : 1, alignItems: "flex-start" }}>
        <button onClick={() => toggleDone(c)} title={isDone ? "Reopen" : "Mark done"} style={{ width: 22, height: 22, marginTop: 2, borderRadius: 6, border: `2px solid ${isDone ? C.green : C.line}`, background: isDone ? C.green : "#fff", color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1, flex: "0 0 auto" }}>{isDone ? "✓" : ""}</button>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Row style={{ gap: 8 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: C.ink, textDecoration: isDone ? "line-through" : "none" }}>{c.customer_name || "—"}</span>
            {!isDone && dueChip(c)}
          </Row>
          {c.reason && <div style={{ fontSize: 13, color: C.slate, marginTop: 2 }}>{c.reason}</div>}
          <Row style={{ gap: 8, marginTop: 4 }}>
            {c.phone && <span style={{ fontSize: 12, color: C.slate }}>{c.phone}</span>}
            {linked && <button onClick={() => onOpen(linked.id)} style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: C.orange + "1A", color: C.orange }}>WO · {orderLabel(linked)}</button>}
            <span style={{ fontSize: 12, color: C.slate }}>{nameOf(c.created_by)}</span>
          </Row>
        </div>
        <Row style={{ gap: 6 }}>
          {c.phone && <a href={`tel:${phone}`} style={{ ...btnSm("#fff", C.ink), border: `1px solid ${C.line}`, textDecoration: "none" }}>Call</a>}
          {c.phone && <a href={`sms:${phone}`} style={{ ...btnSm("#fff", C.ink), border: `1px solid ${C.line}`, textDecoration: "none" }}>Text</a>}
          {(c.created_by === profile.id || isMgr) && <button onClick={() => remove(c)} style={{ fontSize: 12, color: C.red }}>remove</button>}
        </Row>
      </Row>
    );
  };

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Call-backs</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Reminders to call a customer back — on their own, or tied to a work order. Overdue and due-today reminders show a badge on the tab.
      </p>

      <SectionTitle>New reminder</SectionTitle>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, background: "#F6F8F9" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <div><Label>Customer</Label><TextInput value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} placeholder="Name" /></div>
          <div><Label>Phone</Label><TextInput value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><Label>Call back by</Label><TextInput type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></div>
          <div>
            <Label>Attach to work order (optional)</Label>
            <Select value={f.order_id} onChange={(e) => pickOrder(e.target.value)}>
              <option value="">— None —</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{orderLabel(o)}{o.limbo ? " (limbo)" : ""}</option>)}
            </Select>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Label>Reason / note</Label>
          <TextInput value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="What's the call about?" />
        </div>
        <Row style={{ marginTop: 12 }}>
          <button onClick={add} disabled={!f.customer_name.trim() && !f.order_id} style={{ ...btn(C.teal), opacity: (!f.customer_name.trim() && !f.order_id) ? 0.4 : 1 }}>Add reminder</button>
        </Row>
      </div>

      <SectionTitle>To call ({open.length})</SectionTitle>
      {open.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No call-backs pending — all caught up.</div>
      ) : (
        <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${C.line}` }}>{open.map((c) => rowUi(c, false))}</div>
      )}

      <SectionTitle right={
        <button onClick={() => setShowDone(!showDone)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.teal }}>{showDone ? "Hide" : "Show"}</button>
      }>Done ({done.length})</SectionTitle>
      {showDone && (done.length === 0 ? <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing done yet.</div> : (
        <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${C.line}` }}>{done.map((c) => rowUi(c, true))}</div>
      ))}
    </Card>
  );
}
