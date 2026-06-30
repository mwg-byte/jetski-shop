import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, round2, fmtDate, PART_STATUSES, PART_COLORS } from "../lib/supabase";
import { Card, Row, SectionTitle } from "../lib/ui";

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

const skiLabel = (o) => {
  if (!o) return "Unknown order";
  const ski = [o.year, o.make, o.model].filter(Boolean).join(" ");
  return `${o.customer_name}${ski ? " — " + ski : ""}`;
};

export default function Inventory({ crew, orders, onBack }) {
  const [taken, setTaken] = useState([]);
  const [items, setItems] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [consum, setConsum] = useState([]);
  const thisWeek = weekStart(new Date());
  const [week, setWeek] = useState(thisWeek);
  const [showDone, setShowDone] = useState(true);
  const [showRecv, setShowRecv] = useState(false);

  const nameOf = (id) => crew.find((c) => c.id === id)?.display_name || "—";
  const orderOf = (id) => orders.find((o) => o.id === id);

  async function load() {
    const [{ data: p }, { data: ir }, { data: pr }, { data: ct }] = await Promise.all([
      supabase.from("parts").select("*").eq("kind", "taken").order("created_at", { ascending: false }),
      supabase.from("item_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("parts").select("*").eq("kind", "request").order("created_at", { ascending: false }),
      supabase.from("consumables_taken").select("*").order("created_at", { ascending: false }),
    ]);
    setTaken(p || []); setItems(ir || []); setReqs(pr || []); setConsum(ct || []);
  }
  useEffect(() => { load(); }, []);

  async function togglePurchased(it) {
    const purchased = !it.purchased;
    setItems(items.map((x) => (x.id === it.id ? { ...x, purchased, purchased_at: purchased ? new Date().toISOString() : null } : x)));
    await supabase.from("item_requests").update({ purchased, purchased_at: purchased ? new Date().toISOString() : null }).eq("id", it.id);
  }
  async function cycleReq(p) {
    const status = PART_STATUSES[(PART_STATUSES.indexOf(p.status) + 1) % PART_STATUSES.length];
    setReqs(reqs.map((x) => (x.id === p.id ? { ...x, status } : x)));
    await supabase.from("parts").update({ status }).eq("id", p.id);
  }

  const wkStartMs = new Date(week + "T00:00:00").getTime();
  const wkEndMs = wkStartMs + 7 * DAY;
  const inWeek = (val) => { const t = new Date(val).getTime(); return t >= wkStartMs && t < wkEndMs; };
  const isThisWeek = week === thisWeek;
  const weekLabel = `${fmtDate(week)} – ${fmtDate(addDays(week, 6))}`;

  const wkTaken = taken.filter((p) => inWeek(p.created_at));
  const wkQty = wkTaken.reduce((a, p) => a + Number(p.qty), 0);
  const wkConsum = consum.filter((c) => inWeek(c.created_at));
  const wkConsumQty = wkConsum.reduce((a, c) => a + Number(c.qty), 0);

  const openItems = items.filter((x) => !x.purchased);
  const doneItems = items.filter((x) => x.purchased);
  const openReqs = reqs.filter((p) => p.status !== "received");
  const recvReqs = reqs.filter((p) => p.status === "received");

  const woTag = (p) => (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: C.paleTeal, color: C.teal, whiteSpace: "nowrap" }}>{skiLabel(orderOf(p.order_id))}</span>
  );
  const statusChip = (p) => (
    <button onClick={() => cycleReq(p)} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999, background: PART_COLORS[p.status] + "1A", color: PART_COLORS[p.status] }}>{p.status}</button>
  );
  const reqRow = (p) => (
    <Row key={p.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, flexWrap: "wrap", gap: 8, opacity: p.status === "received" ? 0.6 : 1 }}>
      <span style={{ fontWeight: 600, color: C.ink }}>{p.qty}× {p.name}</span>
      {woTag(p)}
      <span style={{ flex: 1, minWidth: 80, color: C.slate }}>{p.note}</span>
      {statusChip(p)}
    </Row>
  );

  const navBtn = (label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 6, background: "#F1F4F6", color: disabled ? "#B7C2CA" : C.ink, opacity: disabled ? 0.6 : 1 }}>{label}</button>
  );

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Inventory</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Parts requested on jobs, parts pulled (by week), and shop item requests — all in one place.
      </p>

      <SectionTitle>Work order parts · needs ordering ({openReqs.length})</SectionTitle>
      {openReqs.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No open parts requests from work orders.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {openReqs.map(reqRow)}
        </div>
      )}
      <SectionTitle right={
        <button onClick={() => setShowRecv(!showRecv)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.teal }}>{showRecv ? "Hide" : "Show"}</button>
      }>Received parts ({recvReqs.length})</SectionTitle>
      {showRecv && (recvReqs.length === 0 ? <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing received yet.</div> : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>{recvReqs.map(reqRow)}</div>
      ))}

      <SectionTitle right={
        <Row style={{ gap: 6 }}>
          {navBtn("‹ Prev", () => setWeek(addDays(week, -7)), false)}
          {!isThisWeek && navBtn("This week", () => setWeek(thisWeek), false)}
          {navBtn("Next ›", () => setWeek(addDays(week, 7)), isThisWeek)}
        </Row>
      }>Parts taken · {weekLabel}</SectionTitle>
      <div style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginBottom: 6 }}>{wkTaken.length} entries · {wkQty} parts pulled this week</div>
      {wkTaken.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No parts taken this week.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {wkTaken.map((p) => (
            <Row key={p.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ color: C.slate, minWidth: 60 }}>{fmtDate(p.created_at)}</span>
              <span style={{ fontWeight: 600, color: C.ink }}>{p.qty}× {p.name}</span>
              <span style={{ flex: 1, color: C.slate }}>{skiLabel(orderOf(p.order_id))}</span>
              {p.note && <span style={{ fontSize: 12, color: C.slate }}>{p.note}</span>}
            </Row>
          ))}
        </div>
      )}

      <SectionTitle>Shop consumables taken · {weekLabel}</SectionTitle>
      <div style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginBottom: 6 }}>{wkConsum.length} entries · {wkConsumQty} items taken this week</div>
      {wkConsum.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No consumables logged this week.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {wkConsum.map((c) => (
            <Row key={c.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ color: C.slate, minWidth: 60 }}>{fmtDate(c.created_at)}</span>
              <span style={{ fontWeight: 600, color: C.ink }}>{c.qty}× {c.name}</span>
              <span style={{ flex: 1, color: C.slate }}>{c.note}</span>
              <span style={{ fontSize: 12, color: C.slate }}>{nameOf(c.taken_by)}</span>
            </Row>
          ))}
        </div>
      )}

      <SectionTitle>Item requests · needs buying ({openItems.length})</SectionTitle>
      {openItems.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing on the list.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {openItems.map((it) => (
            <Row key={it.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <button onClick={() => togglePurchased(it)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${C.line}`, background: "#fff" }} />
              <span style={{ fontWeight: 600, color: C.ink }}>{it.qty}× {it.name}</span>
              <span style={{ flex: 1, color: C.slate }}>{it.note}</span>
              <span style={{ fontSize: 12, color: C.slate }}>{nameOf(it.requested_by)} · {fmtDate(it.created_at)}</span>
            </Row>
          ))}
        </div>
      )}

      <SectionTitle right={
        <button onClick={() => setShowDone(!showDone)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.teal }}>{showDone ? "Hide" : "Show"}</button>
      }>Purchased ({doneItems.length})</SectionTitle>
      {showDone && (doneItems.length === 0 ? <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing purchased yet.</div> : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {doneItems.map((it) => (
            <Row key={it.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, opacity: 0.6 }}>
              <button onClick={() => togglePurchased(it)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${C.green}`, background: C.green, color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</button>
              <span style={{ fontWeight: 600, color: C.ink, textDecoration: "line-through" }}>{it.qty}× {it.name}</span>
              <span style={{ flex: 1, color: C.slate }}>{it.note}</span>
              {it.purchased_at && <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>bought {fmtDate(it.purchased_at)}</span>}
              <span style={{ fontSize: 12, color: C.slate }}>{nameOf(it.requested_by)}</span>
            </Row>
          ))}
        </div>
      ))}
    </Card>
  );
}
