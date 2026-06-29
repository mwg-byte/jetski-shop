import { useState, useEffect } from "react";
import { supabase, C, BODY } from "../lib/supabase";
import { Row, TextInput, Select, Label, SectionTitle, btn } from "../lib/ui";
import { useAuth } from "../AuthContext";

const cell = { fontFamily: BODY, fontSize: 13, color: C.ink, border: "none", background: "transparent", padding: "6px 6px", boxSizing: "border-box" };
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const blankLine = () => ({ qty: "1", part_no: "", name: "", price: "", warranty: "" });
const blankRepair = () => ({ lines: [blankLine()], recommendations: "", estimated_cost: "", estimate_charge: "", basis: "", labor_type: "", payment: "", lube: false, parts_disposition: "", authorized_by: "" });

export default function RepairOrder({ orderId }) {
  const { profile } = useAuth();
  const [d, setD] = useState(null);
  const [saving, setSaving] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("repair_orders").select("data").eq("order_id", orderId).maybeSingle();
      const saved = data?.data;
      if (saved && Array.isArray(saved.lines)) {
        setD({ ...blankRepair(), ...saved, lines: saved.lines.length ? saved.lines : [blankLine()] });
      } else {
        setD(blankRepair());
      }
    })();
  }, [orderId]);

  if (!d) return null;

  const setField = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const setLine = (i, k, v) => setD((p) => ({ ...p, lines: p.lines.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)) }));
  const addLine = () => setD((p) => ({ ...p, lines: [...p.lines, blankLine()] }));
  const removeLine = (i) => setD((p) => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) }));
  const totalParts = d.lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);

  async function save() {
    setSaving("Saving…");
    const { error } = await supabase.from("repair_orders").upsert(
      { order_id: orderId, data: d, updated_by: profile.id, updated_at: new Date().toISOString() },
      { onConflict: "order_id" }
    );
    setSaving(error ? "Couldn't save — try again" : "Saved ✓");
    if (!error) setTimeout(() => setSaving(""), 2500);
  }

  return (
    <>
      <SectionTitle right={<span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: BODY }}>Total parts {money(totalParts)}</span>}>Repair order</SectionTitle>
      <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginBottom: 8 }}>All parts new unless specified — U: used, R: rebuilt, RC: reconditioned. Price is per unit; these lines flow into the invoice.</div>

      <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 8 }}>
        <div style={{ display: "flex", background: C.ink, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: BODY, textTransform: "uppercase", letterSpacing: "0.03em" }}>
          <span style={{ width: 48, padding: "5px 6px" }}>Qty</span>
          <span style={{ width: 90, padding: "5px 6px" }}>Part No</span>
          <span style={{ flex: 1, padding: "5px 6px" }}>Name of part</span>
          <span style={{ width: 80, padding: "5px 6px", textAlign: "right" }}>Price</span>
          <span style={{ width: 52, padding: "5px 6px", textAlign: "center" }}>Warr.</span>
          <span style={{ width: 28 }} />
        </div>
        {d.lines.map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${C.line}` }}>
            <input value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} inputMode="decimal" style={{ ...cell, width: 48 }} />
            <input value={l.part_no} onChange={(e) => setLine(i, "part_no", e.target.value)} style={{ ...cell, width: 90 }} />
            <input value={l.name} onChange={(e) => setLine(i, "name", e.target.value)} placeholder="Part name" style={{ ...cell, flex: 1 }} />
            <input value={l.price} onChange={(e) => setLine(i, "price", e.target.value)} inputMode="decimal" placeholder="0.00" style={{ ...cell, width: 80, textAlign: "right" }} />
            <span onClick={() => setLine(i, "warranty", l.warranty === "Y" ? "N" : l.warranty === "N" ? "" : "Y")} style={{ width: 52, textAlign: "center", cursor: "pointer", fontWeight: 700, fontSize: 13, color: l.warranty === "Y" ? C.green : l.warranty === "N" ? C.red : "#bbb", fontFamily: BODY }}>{l.warranty || "—"}</span>
            <button onClick={() => removeLine(i)} style={{ width: 28, color: C.red, fontSize: 13 }}>✕</button>
          </div>
        ))}
      </div>
      <button onClick={addLine} style={{ fontSize: 13, fontWeight: 600, color: C.teal, fontFamily: BODY }}>+ Add part</button>

      <div style={{ marginTop: 12 }}>
        <Label>Mechanic's recommendations</Label>
        <textarea value={d.recommendations} onChange={(e) => setField("recommendations", e.target.value)} rows={3} style={{ width: "100%", fontFamily: BODY, fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 12px", background: "#FBFCFD", boxSizing: "border-box" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 10 }}>
        <div><Label>Estimated cost ($)</Label><TextInput value={d.estimated_cost} onChange={(e) => setField("estimated_cost", e.target.value)} inputMode="decimal" /></div>
        <div><Label>Estimate charge</Label><TextInput value={d.estimate_charge} onChange={(e) => setField("estimate_charge", e.target.value)} /></div>
        <div><Label>Basis for charge</Label><TextInput value={d.basis} onChange={(e) => setField("basis", e.target.value)} /></div>
        <div><Label>Labor</Label>
          <Select value={d.labor_type} onChange={(e) => setField("labor_type", e.target.value)}>
            <option value="">—</option>
            <option value="flat">Flat rate</option>
            <option value="both">Both</option>
          </Select>
        </div>
        <div><Label>Method of payment</Label>
          <Select value={d.payment} onChange={(e) => setField("payment", e.target.value)}>
            <option value="">—</option>
            <option value="check">Check</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
          </Select>
        </div>
        <div><Label>Parts</Label>
          <Select value={d.parts_disposition} onChange={(e) => setField("parts_disposition", e.target.value)}>
            <option value="">—</option>
            <option value="retain">Retain parts</option>
            <option value="destroy">Destroy parts</option>
          </Select>
        </div>
        <div><Label>Authorized by</Label><TextInput value={d.authorized_by} onChange={(e) => setField("authorized_by", e.target.value)} /></div>
      </div>

      <Row style={{ marginTop: 10, alignItems: "center" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: BODY, fontSize: 14, color: C.ink, cursor: "pointer" }}>
          <input type="checkbox" checked={!!d.lube} onChange={(e) => setField("lube", e.target.checked)} /> Lube
        </label>
        <button onClick={save} style={{ ...btn(C.teal), marginLeft: "auto" }}>Save repair order</button>
        {saving && <span style={{ fontSize: 12, fontWeight: 600, color: C.teal, fontFamily: BODY }}>{saving}</span>}
      </Row>
    </>
  );
}
