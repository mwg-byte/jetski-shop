import { useState } from "react";
import { supabase, C, DISPLAY, BODY, STAGES } from "../lib/supabase";
import { Card, Row, TextInput, Select, Label, SectionTitle, StatusChip, btn, LiveDot } from "../lib/ui";

export function WorkOrderList({ orders, crew, liveCounts, assignees = {}, canCreate, onOpen, onReorder, onNew }) {
  const [statusFilter, setStatusFilter] = useState("open");
  const [techFilter, setTechFilter] = useState("all");
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const visible = orders
    .map((o, i) => ({ o, rank: i }))
    .filter(({ o }) => {
      if (statusFilter === "open" && o.status === "closed") return false;
      if (statusFilter !== "open" && statusFilter !== "all" && o.status !== statusFilter) return false;
      if (techFilter !== "all" && !((assignees[o.id] || []).includes(techFilter))) return false;
      if (q && ![o.customer_name, o.make, o.model, o.hull_id, o.issue].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });

  return (
    <>
      <Row style={{ marginBottom: 12 }}>
        <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, ski, hull, issue…" style={{ maxWidth: 280 }} />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="open">All open</option>
          <option value="all">Everything</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
        <Select value={techFilter} onChange={(e) => setTechFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="all">Any tech</option>
          {crew.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
        </Select>
      </Row>

      {orders.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 40, borderStyle: "dashed" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, textTransform: "uppercase", color: C.ink }}>No work orders yet</div>
          {canCreate && <button onClick={onNew} style={{ ...btn(C.orange), marginTop: 16 }}>+ New work order</button>}
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map(({ o, rank }) => {
            const names = (assignees[o.id] || []).map((id) => crew.find((t) => t.id === id)?.display_name).filter(Boolean);
            const live = liveCounts[o.id] || 0;
            return (
              <div key={o.id} style={{ display: "flex", borderRadius: 8, overflow: "hidden", background: C.card, border: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "8px 6px", background: C.ink, minWidth: 56 }}>
                  <button onClick={() => onReorder(o.id, -1)} disabled={rank === 0} style={{ color: "#fff", fontSize: 16, opacity: rank === 0 ? 0.25 : 1, padding: "4px 8px" }}>▲</button>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{rank + 1}</div>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: "#7E93A3" }}>priority</div>
                  </div>
                  <button onClick={() => onReorder(o.id, 1)} disabled={rank === orders.length - 1} style={{ color: "#fff", fontSize: 16, opacity: rank === orders.length - 1 ? 0.25 : 1, padding: "4px 8px" }}>▼</button>
                </div>
                <button onClick={() => onOpen(o.id)} style={{ flex: 1, textAlign: "left", padding: 12 }}>
                  <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: C.ink }}>{o.customer_name}</span>
                      <span style={{ fontFamily: DISPLAY, fontSize: 16, color: C.slate, marginLeft: 8 }}>{[o.year, o.make, o.model].filter(Boolean).join(" ")}</span>
                      <div style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginTop: 2 }}>{o.issue}</div>
                    </div>
                    <StatusChip status={o.status} />
                  </Row>
                  <Row style={{ marginTop: 8, fontSize: 12, color: C.slate, fontFamily: BODY }}>
                    {live > 0 && <span style={{ color: C.orange, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><LiveDot color={C.orange} /> {live} on the clock</span>}
                    <span>{names.length ? names.join(", ") : "Unassigned"}</span>
                  </Row>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export function NewOrderForm({ onDone, onCancel, nextPriority }) {
  const [f, setF] = useState({ customer_name: "", customer_phone: "", make: "", model: "", year: "", hull_id: "", issue: "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function create() {
    const { data, error } = await supabase.from("work_orders")
      .insert({ ...f, priority: nextPriority }).select().single();
    if (error) setErr(error.message);
    else onDone(data);
  }

  return (
    <Card>
      <h3 style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginBottom: 12 }}>New work order</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div><Label>Customer name *</Label><TextInput value={f.customer_name} onChange={set("customer_name")} /></div>
        <div><Label>Phone</Label><TextInput value={f.customer_phone} onChange={set("customer_phone")} /></div>
        <div><Label>Make</Label><TextInput value={f.make} onChange={set("make")} placeholder="Sea-Doo" /></div>
        <div><Label>Model</Label><TextInput value={f.model} onChange={set("model")} placeholder="GTX 170" /></div>
        <div><Label>Year</Label><TextInput value={f.year} onChange={set("year")} /></div>
        <div><Label>Hull / VIN</Label><TextInput value={f.hull_id} onChange={set("hull_id")} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Label>Issue description *</Label>
        <textarea value={f.issue} onChange={set("issue")} rows={3} style={{ width: "100%", fontFamily: BODY, fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 12px", background: "#FBFCFD" }} />
      </div>
      {err && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY, marginTop: 8 }}>{err}</div>}
      <Row style={{ marginTop: 16 }}>
        <button disabled={!f.customer_name.trim() || !f.issue.trim()} onClick={create} style={{ ...btn(C.orange), opacity: !f.customer_name.trim() || !f.issue.trim() ? 0.4 : 1 }}>Create work order</button>
        <button onClick={onCancel} style={{ fontSize: 14, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Cancel</button>
      </Row>
    </Card>
  );
}
