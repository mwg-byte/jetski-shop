import { useState, useEffect, useRef } from "react";
import { supabase, C, BODY } from "../lib/supabase";
import { Row, TextInput, Select, Label, SectionTitle, btn } from "../lib/ui";
import { useAuth } from "../AuthContext";

const cell = { fontFamily: BODY, fontSize: 13, color: C.ink, border: "none", background: "transparent", padding: "6px 6px", boxSizing: "border-box" };
const fallbackMoney = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const blankMeta = () => ({ recommendations: "", estimated_cost: "", estimate_charge: "", basis: "", labor_type: "", payment: "", lube: false, parts_disposition: "", authorized_by: "" });

export default function RepairOrder({ orderId, taken = [], patchPartLocal, commitPart, updatePart, addTakenPart, deletePart, totalHrs = 0, shopRate = 0, laborCharge = 0, money = fallbackMoney }) {
  const { profile } = useAuth();
  const [d, setD] = useState(null);
  const [saving, setSaving] = useState("");
  const migratedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("repair_orders").select("data").eq("order_id", orderId).maybeSingle();
      const saved = data?.data || {};
      // One-time migration: earlier repair orders stored parts inside data.lines.
      // Move any named line into the shared parts list, then clear it.
      const legacy = Array.isArray(saved.lines) ? saved.lines.filter((l) => (l.name || "").trim() || Number(l.price) > 0) : [];
      if (legacy.length && !saved._linesMigrated && !migratedRef.current && addTakenPart) {
        migratedRef.current = true;
        for (const l of legacy) {
          await addTakenPart({ name: l.name, qty: l.qty, sku: l.part_no, price: l.price, warranty: l.warranty });
        }
        const cleaned = { ...blankMeta(), ...saved, _linesMigrated: true };
        delete cleaned.lines;
        setD(cleaned);
        await supabase.from("repair_orders").upsert(
          { order_id: orderId, data: cleaned, updated_by: profile.id, updated_at: new Date().toISOString() },
          { onConflict: "order_id" }
        );
        return;
      }
      const { lines, ...meta } = saved;
      setD({ ...blankMeta(), ...meta });
    })();
  }, [orderId]);

  if (!d) return null;

  const setField = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const totalParts = taken.reduce((a, p) => a + (Number(p.qty) || 0) * (Number(p.price) || 0), 0);

  async function saveMeta() {
    setSaving("Saving…");
    const { error } = await supabase.from("repair_orders").upsert(
      { order_id: orderId, data: { ...d, _linesMigrated: true }, updated_by: profile.id, updated_at: new Date().toISOString() },
      { onConflict: "order_id" }
    );
    setSaving(error ? "Couldn't save — try again" : "Saved ✓");
    if (!error) setTimeout(() => setSaving(""), 2500);
  }

  return (
    <>
      <SectionTitle right={<span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: BODY }}>Total parts {money(totalParts)}</span>}>Repair order</SectionTitle>
      <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginBottom: 8 }}>
        Customer-facing parts. This list is shared with "Parts taken" above — add or change a part in either place and it updates both. Price is what the customer pays; these lines flow into the invoice.
      </div>

      <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 8 }}>
        <div style={{ display: "flex", background: C.ink, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: BODY, textTransform: "uppercase", letterSpacing: "0.03em" }}>
          <span style={{ width: 48, padding: "5px 6px" }}>Qty</span>
          <span style={{ width: 90, padding: "5px 6px" }}>Part No</span>
          <span style={{ flex: 1, padding: "5px 6px" }}>Name of part</span>
          <span style={{ width: 80, padding: "5px 6px", textAlign: "right" }}>Price</span>
          <span style={{ width: 52, padding: "5px 6px", textAlign: "center" }}>Warr.</span>
          <span style={{ width: 28 }} />
        </div>
        {taken.length === 0 && (
          <div style={{ padding: "8px 8px", fontSize: 13, color: C.slate, fontFamily: BODY, borderBottom: `1px solid ${C.line}` }}>No parts yet — add one below or in "Parts taken" above.</div>
        )}
        {taken.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${C.line}` }}>
            <input value={p.qty ?? ""} onChange={(e) => patchPartLocal(p.id, { qty: e.target.value })} onBlur={(e) => commitPart(p.id, { qty: Number(e.target.value) || 1 })} inputMode="decimal" style={{ ...cell, width: 48 }} />
            <input value={p.sku || ""} onChange={(e) => patchPartLocal(p.id, { sku: e.target.value })} onBlur={(e) => commitPart(p.id, { sku: e.target.value })} style={{ ...cell, width: 90 }} />
            <input value={p.name || ""} onChange={(e) => patchPartLocal(p.id, { name: e.target.value })} onBlur={(e) => commitPart(p.id, { name: e.target.value })} placeholder="Part name" style={{ ...cell, flex: 1 }} />
            <input value={p.price ?? ""} onChange={(e) => patchPartLocal(p.id, { price: e.target.value })} onBlur={(e) => commitPart(p.id, { price: e.target.value === "" ? null : Number(e.target.value) })} inputMode="decimal" placeholder="0.00" style={{ ...cell, width: 80, textAlign: "right" }} />
            <span onClick={() => updatePart(p.id, { warranty: p.warranty === "Y" ? "N" : p.warranty === "N" ? "" : "Y" })} style={{ width: 52, textAlign: "center", cursor: "pointer", fontWeight: 700, fontSize: 13, color: p.warranty === "Y" ? C.green : p.warranty === "N" ? C.red : "#bbb", fontFamily: BODY }}>{p.warranty || "—"}</span>
            <button onClick={() => deletePart(p.id)} style={{ width: 28, color: C.red, fontSize: 13 }}>✕</button>
          </div>
        ))}
      </div>
      <button onClick={() => addTakenPart({})} style={{ fontSize: 13, fontWeight: 600, color: C.teal, fontFamily: BODY }}>+ Add part</button>

      <div style={{ marginTop: 10, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 12px", background: "#F6F8F9", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
          Labor — <b style={{ color: C.ink }}>{totalHrs} hrs</b> from the hour log{shopRate > 0 ? ` @ ${money(shopRate)}/hr` : ""}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: BODY }}>Labor charge {money(laborCharge)}</span>
      </div>

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
        <button onClick={saveMeta} style={{ ...btn(C.teal), marginLeft: "auto" }}>Save repair order</button>
        {saving && <span style={{ fontSize: 12, fontWeight: 600, color: C.teal, fontFamily: BODY }}>{saving}</span>}
      </Row>
      <div style={{ fontSize: 11, color: C.slate, fontFamily: BODY, marginTop: 6 }}>Parts save automatically. "Save repair order" saves the recommendations and the fields above.</div>
    </>
  );
}
