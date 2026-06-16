import { useState, useEffect } from "react";
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

const fi = { border: "none", borderBottom: "1px solid #bbb", background: "transparent", fontFamily: BODY, fontSize: 13, padding: "2px 4px", color: "#111", boxSizing: "border-box" };
const h3 = { fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "#111", marginTop: 20, marginBottom: 8, borderBottom: "2px solid #333", paddingBottom: 4 };

export default function Inspection({ order, canEdit, onClose }) {
  const { profile } = useAuth();
  const mgr = !!canEdit;
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState("");
  const [d, setD] = useState({ customer: {}, machine: {}, dropoff: {}, pickup: {}, water_test: "", notes: "" });

  useEffect(() => {
    (async () => {
      const base = {
        customer: { name: order.customer_name || "", phone: order.customer_phone || "", email: "", address: "", emergency: "", date: new Date().toLocaleDateString() },
        machine: { type: "", year: order.year || "", make: order.make || "", model: order.model || "", color: "", vin: order.hull_id || "", trailer: "", plate: "" },
        dropoff: {}, pickup: {}, water_test: "", notes: "",
      };
      const { data } = await supabase.from("inspections").select("data").eq("order_id", order.id).maybeSingle();
      const saved = data?.data || {};
      setD({
        customer: { ...base.customer, ...(saved.customer || {}) },
        machine: { ...base.machine, ...(saved.machine || {}) },
        dropoff: saved.dropoff || {},
        pickup: saved.pickup || {},
        water_test: saved.water_test || "",
        notes: saved.notes || "",
      });
      setReady(true);
    })();
  }, [order.id]);

  const setField = (sec, key, v) => setD((p) => ({ ...p, [sec]: { ...p[sec], [key]: v } }));
  const setCell = (sec, item, sub, v) => setD((p) => ({ ...p, [sec]: { ...p[sec], [item]: { ...(p[sec]?.[item] || {}), [sub]: v } } }));

  async function save() {
    setSaving("Saving…");
    const { error } = await supabase.from("inspections").upsert(
      { order_id: order.id, data: d, updated_by: profile.id, updated_at: new Date().toISOString() },
      { onConflict: "order_id" }
    );
    setSaving(error ? "Couldn't save — try again" : "Saved ✓");
    if (!error) setTimeout(() => setSaving(""), 2500);
  }

  const fieldRow = (label, sec, key) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
      <span style={{ width: 150, flexShrink: 0, fontWeight: 600, fontSize: 13, fontFamily: BODY, color: "#111" }}>{label}</span>
      <input value={d[sec][key] || ""} onChange={(e) => setField(sec, key, e.target.value)} readOnly={!mgr} style={{ ...fi, flex: 1 }} />
    </div>
  );

  const inspectTable = (sec, condLabel) => (
    <div style={{ border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ display: "flex", background: "#1f1f1f", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: BODY }}>
        <span style={{ width: 170, padding: "4px 8px" }}>Inspection Item</span>
        <span style={{ flex: 1, padding: "4px 8px" }}>{condLabel}</span>
        <span style={{ flex: 2, padding: "4px 8px" }}>Notes / Damage</span>
      </div>
      {ITEMS.map(([key, label]) => (
        <div key={key} style={{ display: "flex", borderBottom: "1px solid #eee", alignItems: "center" }}>
          <span style={{ width: 170, padding: "5px 8px", fontSize: 12, fontWeight: 600, fontFamily: BODY, color: "#111" }}>{label}</span>
          <input value={d[sec][key]?.cond || ""} onChange={(e) => setCell(sec, key, "cond", e.target.value)} readOnly={!mgr} placeholder={mgr ? "Condition" : ""} style={{ ...fi, flex: 1, borderBottom: "none", borderRight: "1px solid #eee" }} />
          <input value={d[sec][key]?.notes || ""} onChange={(e) => setCell(sec, key, "notes", e.target.value)} readOnly={!mgr} placeholder={mgr ? "Notes / damage" : ""} style={{ ...fi, flex: 2, borderBottom: "none" }} />
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

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(8,20,30,0.6)", overflow: "auto", padding: 16 }}>
      <style>{`@media print { body * { visibility: hidden !important; } #insp, #insp * { visibility: visible !important; } #insp { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; } .no-print { display: none !important; } }`}</style>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
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
            {fieldRow("Customer Name", "customer", "name")}
            {fieldRow("Phone Number", "customer", "phone")}
            {fieldRow("Email Address", "customer", "email")}
            {fieldRow("Address", "customer", "address")}
            {fieldRow("Emergency Contact", "customer", "emergency")}
            {fieldRow("Date", "customer", "date")}

            <div style={h3}>Machine Information</div>
            {fieldRow("Type (Boat / Jet Ski)", "machine", "type")}
            {fieldRow("Year", "machine", "year")}
            {fieldRow("Make", "machine", "make")}
            {fieldRow("Model", "machine", "model")}
            {fieldRow("Color", "machine", "color")}
            {fieldRow("VIN / Hull ID", "machine", "vin")}
            {fieldRow("Trailer Included (Yes / No)", "machine", "trailer")}
            {fieldRow("License Plate #", "machine", "plate")}

            <div style={h3}>Drop-Off Inspection / Condition Report</div>
            {inspectTable("dropoff", "Condition at Drop-Off")}

            <div style={h3}>Pick-Up Inspection / Condition Report</div>
            {inspectTable("pickup", "Condition at Pick-Up")}

            <div style={h3}>Water / Operational Testing</div>
            <div style={{ fontFamily: BODY, fontSize: 13, color: "#111", marginBottom: 8 }}>Does the customer authorize and request water testing / operational testing of the machine?</div>
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
              By signing above, the customer acknowledges the condition of the machine at the time of drop-off and pick-up. Any existing damage noted at drop-off has been documented.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}