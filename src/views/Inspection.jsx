import { useState, useEffect, useRef } from "react";
import { supabase, C, DISPLAY, BODY } from "../lib/supabase";
import { useAuth } from "../AuthContext";

const ITEMS = [
  ["exterior", "Exterior / Hull Condition"],
  ["seats", "Seats / Upholstery"],
  ["engine", "Engine Condition"],
  ["battery", "Battery"],
  ["lights", "Lights"],
  ["trailer_tires", "Trailer Tires"],
  ["fuel_level", "Fuel Level"],
  ["accessories", "Accessories Included"],
  ["existing_damage", "Existing Damage"],
];

const fi = { border: "none", borderBottom: "1px solid #bbb", background: "transparent", fontFamily: BODY, fontSize: 13, color: "#111", padding: "2px 4px", boxSizing: "border-box" };
const h3 = { fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "#111", marginTop: 20, marginBottom: 8, borderBottom: "2px solid #333", paddingBottom: 4 };

const blankUnit = () => ({ machine: { type: "", year: "", make: "", model: "", color: "", vin: "", registration: "", trailer: "", plate: "" }, dropoff: {}, pickup: {} });
const skisOf = (o) => (Array.isArray(o?.skis) && o.skis.length)
  ? o.skis
  : (o && (o.year || o.make || o.model || o.hull_id || o.registration)
      ? [{ year: o.year || "", make: o.make || "", model: o.model || "", hull_id: o.hull_id || "", registration: o.registration || "" }]
      : []);

function AutoGrow({ value, onChange, readOnly, placeholder, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea ref={ref} rows={1} value={value} onChange={onChange} readOnly={readOnly} placeholder={placeholder}
      style={{ ...style, resize: "none", overflow: "hidden", display: "block", lineHeight: 1.35 }} />
  );
}

export default function Inspection({ order, canEdit, onClose }) {
  const { profile } = useAuth();
  const mgr = !!canEdit;
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState("");
  const [d, setD] = useState({ customer: {}, units: [], water_test: "", notes: "" });

  useEffect(() => {
    (async () => {
      const baseCustomer = { name: order.customer_name || "", phone: order.customer_phone || "", email: "", address: "", emergency: "", date: new Date().toLocaleDateString() };
      const unitFromSki = (s) => ({ machine: { type: "", year: s.year || "", make: s.make || "", model: s.model || "", color: "", vin: s.hull_id || "", registration: s.registration || "", trailer: "", plate: "" }, dropoff: {}, pickup: {} });
      const { data } = await supabase.from("inspections").select("data").eq("order_id", order.id).maybeSingle();
      const saved = data?.data || {};
      let units;
      if (Array.isArray(saved.units) && saved.units.length) {
        units = saved.units.map((u) => ({ machine: { ...blankUnit().machine, ...(u.machine || {}) }, dropoff: u.dropoff || {}, pickup: u.pickup || {} }));
      } else if (saved.machine || saved.dropoff || saved.pickup) {
        units = [{ machine: { ...blankUnit().machine, ...(saved.machine || {}) }, dropoff: saved.dropoff || {}, pickup: saved.pickup || {} }];
      } else {
        const skis = skisOf(order);
        units = skis.length ? skis.map(unitFromSki) : [blankUnit()];
      }
      setD({ customer: { ...baseCustomer, ...(saved.customer || {}) }, units, water_test: saved.water_test || "", notes: saved.notes || "" });
      setReady(true);
    })();
  }, [order.id]);

  const setCustomer = (k, v) => setD((p) => ({ ...p, customer: { ...p.customer, [k]: v } }));
  const setUnitMachine = (i, k, v) => setD((p) => ({ ...p, units: p.units.map((u, idx) => (idx === i ? { ...u, machine: { ...u.machine, [k]: v } } : u)) }));
  const setUnitCell = (i, sec, item, sub, v) => setD((p) => ({ ...p, units: p.units.map((u, idx) => (idx === i ? { ...u, [sec]: { ...(u[sec] || {}), [item]: { ...((u[sec] || {})[item] || {}), [sub]: v } } } : u)) }));
  const addUnit = () => setD((p) => ({ ...p, units: [...p.units, blankUnit()] }));
  const removeUnit = (i) => setD((p) => ({ ...p, units: p.units.filter((_, idx) => idx !== i) }));

  async function save() {
    setSaving("Saving…");
    const { error } = await supabase.from("inspections").upsert(
      { order_id: order.id, data: d, updated_by: profile.id, updated_at: new Date().toISOString() },
      { onConflict: "order_id" }
    );
    setSaving(error ? "Couldn't save — try again" : "Saved ✓");
    if (!error) setTimeout(() => setSaving(""), 2500);
  }

  const custRow = (label, key) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
      <span style={{ width: 150, flexShrink: 0, fontWeight: 600, fontSize: 13, fontFamily: BODY, color: "#111" }}>{label}</span>
      <AutoGrow value={d.customer[key] || ""} onChange={(e) => setCustomer(key, e.target.value)} readOnly={!mgr} style={{ ...fi, flex: 1 }} />
    </div>
  );
  const machRow = (i, label, key) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
      <span style={{ width: 150, flexShrink: 0, fontWeight: 600, fontSize: 13, fontFamily: BODY, color: "#111" }}>{label}</span>
      <AutoGrow value={d.units[i].machine[key] || ""} onChange={(e) => setUnitMachine(i, key, e.target.value)} readOnly={!mgr} style={{ ...fi, flex: 1 }} />
    </div>
  );
  const inspectTable = (i, sec, condLabel) => (
    <div style={{ border: "1px solid #ccc", borderRadius: 4, overflow: "hidden", pageBreakInside: "avoid" }}>
      <div style={{ display: "flex", background: "#1f1f1f", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: BODY }}>
        <span style={{ width: 170, padding: "4px 8px" }}>Inspection Item</span>
        <span style={{ flex: 1, padding: "4px 8px" }}>{condLabel}</span>
        <span style={{ flex: 2, padding: "4px 8px" }}>Notes / Damage</span>
      </div>
      {ITEMS.map(([key, label]) => (
        <div key={key} style={{ display: "flex", borderBottom: "1px solid #eee", alignItems: "stretch" }}>
          <span style={{ width: 170, padding: "5px 8px", fontSize: 12, fontWeight: 600, fontFamily: BODY, color: "#111" }}>{label}</span>
          <AutoGrow value={(d.units[i][sec][key] || {}).cond || ""} onChange={(e) => setUnitCell(i, sec, key, "cond", e.target.value)} readOnly={!mgr} placeholder={mgr ? "Condition" : ""} style={{ ...fi, flex: 1, borderBottom: "none", borderRight: "1px solid #eee" }} />
          <AutoGrow value={(d.units[i][sec][key] || {}).notes || ""} onChange={(e) => setUnitCell(i, sec, key, "notes", e.target.value)} readOnly={!mgr} placeholder={mgr ? "Notes / damage" : ""} style={{ ...fi, flex: 2, borderBottom: "none" }} />
        </div>
      ))}
    </div>
  );
  const sigBlock = (label) => (
    <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
      <div style={{ flex: 2 }}>
        <div style={{ borderBottom: "1px solid #333", height: 22 }} />
        <div style={{ fontSize: 11, color: "#555", fontFamily: BODY }}>{label}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ borderBottom: "1px solid #333", height: 22 }} />
        <div style={{ fontSize: 11, color: "#555", fontFamily: BODY }}>Date</div>
      </div>
    </div>
  );

  const many = d.units.length > 1;
  const suffix = (i) => (many ? ` — Ski ${i + 1}` : "");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(8,20,30,0.6)", overflow: "auto", padding: 16 }}>
      <style>{`@media print { body * { visibility: hidden !important; } #insp, #insp * { visibility: visible !important; } #insp { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; } .no-print { display: none !important; } }`}</style>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => window.print()} style={{ background: C.teal, color: "#fff", fontWeight: 700, fontFamily: BODY, fontSize: 14, padding: "10px 16px", borderRadius: 8 }}>Print / Save as PDF</button>
          {mgr && <button onClick={save} style={{ background: C.orange, color: "#fff", fontWeight: 700, fontFamily: BODY, fontSize: 14, padding: "10px 16px", borderRadius: 8 }}>Save</button>}
          <button onClick={onClose} style={{ background: "#fff", color: C.ink, fontWeight: 700, fontFamily: BODY, fontSize: 14, padding: "10px 16px", borderRadius: 8 }}>Close</button>
          {saving && <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: "#fff" }}>{saving}</span>}
          {!mgr && <span style={{ fontFamily: BODY, fontSize: 12, color: "#CFE0EA" }}>View only — managers can edit</span>}
        </div>

        {!ready ? (
          <div style={{ background: "#fff", padding: 40, textAlign: "center", fontFamily: BODY, color: C.slate, borderRadius: 4 }}>Loading…</div>
        ) : (
          <div id="insp" style={{ background: "#fff", padding: 28, boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color: "#111" }}>High Country Powersports</div>
              <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 600, color: "#111" }}>Jet Ski &amp; Boat Drop-Off / Pick-Up Inspection Form</div>
            </div>

            <div style={h3}>Customer Information</div>
            {custRow("Customer Name", "name")}
            {custRow("Phone Number", "phone")}
            {custRow("Email Address", "email")}
            {custRow("Address", "address")}
            {custRow("Emergency Contact", "emergency")}
            {custRow("Date", "date")}

            {d.units.map((u, i) => (
              <div key={i} style={{ marginTop: i ? 22 : 0, borderTop: i ? "3px solid #111" : "none", paddingTop: i ? 10 : 0 }}>
                <div style={{ ...h3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Machine Information{suffix(i)}</span>
                  {mgr && many && <button className="no-print" onClick={() => removeUnit(i)} style={{ fontSize: 12, fontWeight: 600, color: C.red, fontFamily: BODY }}>remove ski</button>}
                </div>
                {machRow(i, "Type (Boat / Jet Ski)", "type")}
                {machRow(i, "Year", "year")}
                {machRow(i, "Make", "make")}
                {machRow(i, "Model", "model")}
                {machRow(i, "Color", "color")}
                {machRow(i, "VIN / Hull ID", "vin")}
                {machRow(i, "Registration #", "registration")}
                {machRow(i, "Trailer Included (Yes / No)", "trailer")}
                {machRow(i, "License Plate #", "plate")}

                <div style={h3}>Drop-Off Inspection / Condition Report{suffix(i)}</div>
                {inspectTable(i, "dropoff", "Condition at Drop-Off")}

                <div style={h3}>Pick-Up Inspection / Condition Report{suffix(i)}</div>
                {inspectTable(i, "pickup", "Condition at Pick-Up")}
              </div>
            ))}
            {mgr && (
              <button className="no-print" onClick={addUnit} style={{ marginTop: 12, fontFamily: BODY, fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 6, background: C.paleTeal, color: C.teal }}>+ Add another ski</button>
            )}

            <div style={h3}>Water / Operational Testing</div>
            <div style={{ fontFamily: BODY, fontSize: 13, color: "#111", marginBottom: 8 }}>Does the customer authorize and request water testing / operational testing of the machine(s)?</div>
            <div>
              {["yes", "no"].map((v) => (
                <span key={v} onClick={() => mgr && setD((p) => ({ ...p, water_test: p.water_test === v ? "" : v }))} style={{ cursor: mgr ? "pointer" : "default", marginRight: 28, fontFamily: BODY, fontSize: 15, fontWeight: 600, color: "#111" }}>
                  <span style={{ display: "inline-block", width: 16, height: 16, border: "1.5px solid #333", marginRight: 8, textAlign: "center", lineHeight: "15px", fontSize: 12, verticalAlign: "middle" }}>{d.water_test === v ? "✓" : ""}</span>
                  {v.toUpperCase()}
                </span>
              ))}
            </div>

            <div style={h3}>Additional Notes</div>
            <textarea value={d.notes} onChange={(e) => setD((p) => ({ ...p, notes: e.target.value }))} readOnly={!mgr} rows={5} style={{ width: "100%", fontFamily: BODY, fontSize: 13, color: "#111", border: "1px solid #ccc", borderRadius: 4, padding: "8px 10px", background: "#fff", boxSizing: "border-box", resize: "vertical" }} />

            <div style={h3}>Signatures</div>
            {sigBlock("Customer Signature (Drop-Off)")}
            {sigBlock("Employee Signature (Drop-Off)")}
            {sigBlock("Customer Signature (Pick-Up)")}
            {sigBlock("Employee Signature (Pick-Up)")}
            <div style={{ fontFamily: BODY, fontSize: 11, fontStyle: "italic", color: "#555", marginTop: 8 }}>
              By signing above, the customer acknowledges the condition of the machine(s) at the time of drop-off and pick-up. Any existing damage noted at drop-off has been documented.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
