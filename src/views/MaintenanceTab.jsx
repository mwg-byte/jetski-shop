import { useState } from "react";
import { C, DISPLAY, BODY } from "../lib/supabase";
import { Card, Row, StatusChip, LiveDot } from "../lib/ui";

export default function MaintenanceTab({ orders, crew, assignees = {}, liveCounts = {}, onOpen, onBack }) {
  const [showDone, setShowDone] = useState(false);
  const tasks = orders.filter((o) => o.kind === "maintenance");
  const open = tasks.filter((o) => o.status !== "closed");
  const done = tasks.filter((o) => o.status === "closed");
  const visible = showDone ? tasks : open;

  const card = (o) => {
    const names = (assignees[o.id] || []).map((id) => crew.find((t) => t.id === id)?.display_name).filter(Boolean);
    const live = liveCounts[o.id] || 0;
    return (
      <button key={o.id} onClick={() => onOpen(o.id)} style={{ textAlign: "left", padding: 12, borderRadius: 8, background: C.card, border: `1px solid ${C.line}` }}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: C.ink }}>{o.customer_name}</span>
          <StatusChip status={o.status} />
        </Row>
        {o.issue && <div style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginTop: 2 }}>{o.issue}</div>}
        <Row style={{ marginTop: 8, fontSize: 12, color: C.slate, fontFamily: BODY }}>
          {live > 0 && <span style={{ color: C.orange, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><LiveDot color={C.orange} /> {live} on the clock</span>}
          <span>{names.length ? names.join(", ") : "Unassigned"}</span>
        </Row>
      </button>
    );
  };

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Maintenance</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Maintenance tasks for the shop. Tap one to clock in and log your time, just like a work order.
      </p>

      {visible.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY, marginTop: 12 }}>No maintenance tasks right now.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {visible.map(card)}
        </div>
      )}

      {done.length > 0 && (
        <button onClick={() => setShowDone(!showDone)} style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: C.teal, marginTop: 12 }}>
          {showDone ? "Hide finished" : `Show finished (${done.length})`}
        </button>
      )}
    </Card>
  );
}
