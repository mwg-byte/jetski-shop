import { useState } from "react";
import { supabase, C, DISPLAY, BODY } from "../lib/supabase";
import { Card, Row, TextInput, Select, Label, SectionTitle, StatusChip, btn, LiveDot } from "../lib/ui";

const GROUPS = [
  { key: "intake", label: "Intake", statuses: ["intake", "diagnosing"] },
  { key: "awaiting", label: "Awaiting Parts", statuses: ["awaiting_parts"] },
  { key: "repair", label: "In Repair", statuses: ["in_repair", "testing"] },
  { key: "ready", label: "Ready", statuses: ["ready"] },
  { key: "completed", label: "Completed", statuses: ["closed"] },
];

export function WorkOrderList({ orders, crew, liveCounts, assignees = {}, canCreate, onOpen, onReorder, onNew }) {
  const [tab, setTab] = useState("repair");
  const [techFilter, setTechFilter] = useState("all");
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const matches = (o) =>
    (techFilter === "all" || (assignees[o.id] || []).includes(techFilter)) &&
    (!q || [o.customer_name, o.make, o.model, o.hull_id, o.issue].join(" ").toLowerCase().includes(q));
  const countFor = (g) => orders.filter((o) => g.statuses.includes(o.status) && matches(o)).length;

  const group = GROUPS.find((g) => g.key === tab) || GROUPS[2];
  const visible = orders
    .map((o, i) => ({ o, rank: i }))
    .filter(({ o }) => group.statuses.includes(o.status) && matches(o));

  return (
    <>
      <Row style={{ marginBottom: 12 }}>
        <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, ski, hull, issue…" style={{ maxWidth: 280 }} />
        <Select value={techFilter} onChange={(e) => setTechFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="all">Any tech</option>
          {crew.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
        </Select>
      </Row>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
        {GROUPS.map((g) => {
          const n = countFor(g);
          const active = tab === g.key;
          return (
            <button key={g.key} onClick={() => setTab(g.key)} style={{
              flex: "0 0 auto", fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em",
              padding: "8px 14px", borderRadius: 999, whiteSpace: "nowrap",
              background: active ? C.ink : "#F1F4F6", color: active ? "#fff" : C.slate,
            }}>
              {g.label}
              {n > 0 && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: active ? "rgba(255,255,255,0.22)" : C.line, color: active ? "#fff" : C.ink }}>{n}</span>}
            </button>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 40, borderStyle: "dashed" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, textTransform: "uppercase", color: C.ink }}>No work orders yet</div>
          {canCreate && <button onClick={onNew} style={{ ...btn(C.orange), marginTop: 16 }}>+ New work order</button>}
        </Card>
      ) : visible.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 32, borderStyle: "dashed" }}>
          <div style={{ fontFamily: BODY, fontSize: 14, color: C.slate }}>Nothing in <b>{group.label}</b> right now.</div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map(({ o, rank }, vi) => {
            const names = (assignees[o.id] || []).map((id) => crew.find((t) => t.id === id)?.display_name).filter(Boolean);
            const live = liveCounts[o.id] || 0;
            const upDelta = vi > 0 ? visible[vi - 1].rank - rank : 0;
            const downDelta = vi < visible.length - 1 ? visible[vi + 1].rank - rank : 0;
            return (
              <div key={o.id} style={{ display: "flex", borderRadius: 8, overflow: "hidden", background: C.card, border: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "8px 6px", background: C.ink, minWidth: 56 }}>
                  <button onClick={() => onReorder(o.id, upDelta)} disabled={vi === 0} style={{ color: "#fff", fontSize: 16, opacity: vi === 0 ? 0.25 : 1, padding: "4px 8px" }}>▲</button>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{vi + 1}</div>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: "#7E93A3" }}>priority</div>
                  </div>
                  <button onClick={() => onReorder(o.id, downDelta)} disabled={vi === visible.length - 1} style={{ color: "#fff", fontSize: 16, opacity: vi === visible.length - 1 ? 0.25 : 1, padding: "4px 8px" }}>▼</button>
                </div>
                <button onClick={() => onOpen(o.id)} style={{ flex: 1, textAlign: "left", padding: 12 }}>
                  <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: C.ink }}>{o.customer_name}</span>
                      {o.kind === "maintenance" ? (
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 999, background: "#A162071A", color: "#A16207", marginLeft: 8 }}>Maintenance</span>
                      ) : (
                        <span style={{ fontFamily: DISPLAY, fontSize: 16, color: C.slate, marginLeft: 8 }}>{[o.year, o.make, o.model].filter(Boolean).join(" ")}{Array.isArray(o.skis) && o.skis.length > 1 ? ` +${o.skis.length - 1} more` : ""}</span>
                      )}
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

export const blankSki = () => ({ year: "", make: "", model: "", hull_id: "", registration: "" });
export const cleanSkis = (arr) => arr
  .map((s) => ({ year: (s.year || "").trim(), make: (s.make || "").trim(), model: (s.model || "").trim(), hull_id: (s.hull_id || "").trim(), registration: (s.registration || "").trim() }))
  .filter((s) => s.year || s.make || s.model || s.hull_id || s.registration);

export function SkiEditor({ skis, onChange }) {
  const setSki = (i, k, v) => onChange(skis.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)));
  const addSki = () => onChange([...skis, blankSki()]);
  const removeSki = (i) => onChange(skis.filter((_, idx) => idx !== i));
  return (
    <>
      {skis.map((s, i) => (
        <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, marginTop: 8, background: "#fff" }}>
          <Row style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, textTransform: "uppercase", color: C.ink }}>Ski {i + 1}</span>
            {skis.length > 1 && <button onClick={() => removeSki(i)} style={{ fontSize: 12, fontWeight: 600, color: C.red, fontFamily: BODY }}>remove</button>}
          </Row>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div><Label>Make</Label><TextInput value={s.make} onChange={(e) => setSki(i, "make", e.target.value)} placeholder="Sea-Doo" /></div>
            <div><Label>Model</Label><TextInput value={s.model} onChange={(e) => setSki(i, "model", e.target.value)} placeholder="GTX 170" /></div>
            <div><Label>Year</Label><TextInput value={s.year} onChange={(e) => setSki(i, "year", e.target.value)} /></div>
            <div><Label>HIN (Hull ID)</Label><TextInput value={s.hull_id} onChange={(e) => setSki(i, "hull_id", e.target.value)} /></div>
            <div><Label>Registration #</Label><TextInput value={s.registration} onChange={(e) => setSki(i, "registration", e.target.value)} /></div>
          </div>
        </div>
      ))}
      <button onClick={addSki} style={{ marginTop: 8, fontFamily: BODY, fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 6, background: C.paleTeal, color: C.teal }}>+ Add ski</button>
    </>
  );
}

export function NewOrderForm({ onDone, onCancel, nextPriority }) {
  const [f, setF] = useState({ customer_name: "", customer_phone: "", issue: "" });
  const [skis, setSkis] = useState([blankSki()]);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function create() {
    const list = cleanSkis(skis);
    const s0 = list[0] || {};
    const { data, error } = await supabase.from("work_orders").insert({
      customer_name: f.customer_name, customer_phone: f.customer_phone, issue: f.issue, priority: nextPriority,
      skis: list, year: s0.year || "", make: s0.make || "", model: s0.model || "", hull_id: s0.hull_id || "", registration: s0.registration || "",
    }).select().single();
    if (error) setErr(error.message);
    else onDone(data);
  }

  return (
    <Card>
      <h3 style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginBottom: 12 }}>New work order</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div><Label>Customer name *</Label><TextInput value={f.customer_name} onChange={set("customer_name")} /></div>
        <div><Label>Phone</Label><TextInput value={f.customer_phone} onChange={set("customer_phone")} /></div>
      </div>
      <div style={{ marginTop: 14 }}>
        <Label>Skis</Label>
        <SkiEditor skis={skis} onChange={setSkis} />
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

export function MaintenanceForm({ crew = [], onDone, onCancel, nextPriority }) {
  const [f, setF] = useState({ title: "", details: "", assignee: "" });
  const [err, setErr] = useState("");

  async function create() {
    const { data, error } = await supabase.from("work_orders")
      .insert({ kind: "maintenance", customer_name: f.title.trim(), issue: f.details.trim() || f.title.trim(), priority: nextPriority })
      .select().single();
    if (error) { setErr(error.message); return; }
    if (f.assignee) await supabase.from("order_assignees").insert({ order_id: data.id, tech_id: f.assignee });
    onDone(data);
  }

  return (
    <Card>
      <h3 style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginBottom: 12 }}>New maintenance task</h3>
      <div><Label>Task *</Label><TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Morning trash run" /></div>
      <div style={{ marginTop: 12 }}>
        <Label>Details</Label>
        <textarea value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} rows={3} placeholder="Sweeping bays, hauling trash, dump run…" style={{ width: "100%", fontFamily: BODY, fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 12px", background: "#FBFCFD" }} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Label>Assign to</Label>
        <Select value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })} style={{ width: "100%", maxWidth: 280 }}>
          <option value="">— Assign later —</option>
          {crew.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
        </Select>
      </div>
      {err && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY, marginTop: 8 }}>{err}</div>}
      <Row style={{ marginTop: 16 }}>
        <button disabled={!f.title.trim()} onClick={create} style={{ ...btn(C.orange), opacity: !f.title.trim() ? 0.4 : 1 }}>Start task</button>
        <button onClick={onCancel} style={{ fontSize: 14, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Cancel</button>
      </Row>
    </Card>
  );
}