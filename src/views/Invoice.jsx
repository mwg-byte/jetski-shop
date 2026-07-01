import { useState, useEffect, useRef } from "react";
import { supabase, C, DISPLAY, BODY, round2 } from "../lib/supabase";

const RED = "#B23A48";
const DARK = "#1f1f1f";
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const cellInp = { fontFamily: BODY, fontSize: 13, color: "#111", border: "none", borderBottom: "1px solid #ddd", background: "transparent", padding: "3px 4px", width: "100%", boxSizing: "border-box" };
const boxInp = { fontFamily: BODY, fontSize: 13, color: "#111", border: "none", background: "#fff", padding: "3px 8px", width: "100%", boxSizing: "border-box", textAlign: "right" };
const bar = { background: DARK, color: "#fff", fontSize: 12, fontWeight: 600, padding: "3px 8px", fontFamily: BODY };

export default function Invoice({ order, parts = [], hours = [], shopRate = 0, onClose }) {
  const skisOf = (o) => (Array.isArray(o?.skis) && o.skis.length)
    ? o.skis
    : (o && (o.year || o.make || o.model || o.hull_id || o.registration)
        ? [{ year: o.year || "", make: o.make || "", model: o.model || "", hull_id: o.hull_id || "", registration: o.registration || "" }]
        : []);
  const skis = skisOf(order);
  const totalHrs = round2(hours.reduce((a, h) => a + Number(h.hours), 0));
  const taken = parts.filter((p) => p.kind === "taken");

  const [lines, setLines] = useState([]);
  const [m, setM] = useState({
    number: "", date: new Date().toLocaleDateString(), terms: "", customerNum: "", rep: "",
    taxRate: "7.45", discount: "0", shipping: "0", amountPaid: "0", notes: "",
  });
  const [saved, setSaved] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("invoices").select("data").eq("order_id", order.id).maybeSingle();
      const inv = data?.data;
      if (inv && Array.isArray(inv.lines)) {
        // Restore the exact invoice as it was left.
        if (inv.m && typeof inv.m === "object") setM((prev) => ({ ...prev, ...inv.m }));
        setLines(inv.lines);
      } else {
        // First time — build the lines from the parts taken + labor.
        const init = taken.map((p) => ({
          desc: [p.sku, p.name].filter(Boolean).join(" — ") || p.name || "",
          qty: String(p.qty || "1"),
          rate: p.price != null ? String(p.price) : "",
          tax: true,
        }));
        init.push({ desc: "Labor", qty: String(totalHrs || ""), rate: shopRate ? String(shopRate) : "", tax: false });
        setLines(init);
      }
      loaded.current = true;
    })();
  }, [order.id]);

  // Autosave whatever is on the invoice so it's all there next time it's opened.
  useEffect(() => {
    if (!loaded.current) return;
    setSaved("Saving…");
    const t = setTimeout(async () => {
      const { error } = await supabase.from("invoices").upsert(
        { order_id: order.id, data: { m, lines }, updated_at: new Date().toISOString() },
        { onConflict: "order_id" }
      );
      setSaved(error ? "Couldn't save" : "Saved ✓");
    }, 600);
    return () => clearTimeout(t);
  }, [m, lines]);
  const skiLines = skis.map((s) => {
    const lbl = [s.year, s.make, s.model].filter(Boolean).join(" ");
    const ids = [s.hull_id && `HIN ${s.hull_id}`, s.registration && `Reg ${s.registration}`].filter(Boolean).join(" · ");
    return [lbl, ids].filter(Boolean).join(" — ");
  }).filter(Boolean);
  const billTo = [order.customer_name, order.customer_phone, ...skiLines].filter(Boolean);

  const setLine = (i, k, v) => setLines(lines.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const amount = (l) => (Number(l.qty) || 0) * (Number(l.rate) || 0);
  const subtotal = lines.reduce((a, l) => a + amount(l), 0);
  const taxable = lines.filter((l) => l.tax).reduce((a, l) => a + amount(l), 0);
  const tax = taxable * (Number(m.taxRate) || 0) / 100;
  const total = subtotal - (Number(m.discount) || 0) + (Number(m.shipping) || 0) + tax;
  const due = total - (Number(m.amountPaid) || 0);
  const set = (k) => (e) => setM({ ...m, [k]: e.target.value });

  const totRow = (label, value, input) => (
    <div style={{ display: "flex", alignItems: "stretch", marginBottom: 4 }}>
      <span style={{ ...bar, flex: 1 }}>{label}</span>
      <span style={{ width: 90, textAlign: "right", fontSize: 13, padding: "3px 4px", fontFamily: BODY }}>
        {input || money(value)}
      </span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(8,20,30,0.6)", overflow: "auto", padding: 16 }}>
      <style>{`@media print { body * { visibility: hidden !important; } #inv, #inv * { visibility: visible !important; } #inv { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; } .no-print { display: none !important; } }`}</style>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={() => window.print()} style={{ background: C.teal, color: "#fff", fontWeight: 700, fontFamily: BODY, fontSize: 14, padding: "10px 16px", borderRadius: 8 }}>Print / Save as PDF</button>
          <button onClick={onClose} style={{ background: "#fff", color: C.ink, fontWeight: 700, fontFamily: BODY, fontSize: 14, padding: "10px 16px", borderRadius: 8 }}>Close</button>
          {saved && <span style={{ alignSelf: "center", fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: BODY, opacity: 0.9 }}>{saved}</span>}
        </div>

        <div id="inv" style={{ background: "#fff", padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
          {/* banner */}
          <div style={{ display: "flex", background: RED, color: "#fff", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ flex: 1, padding: "16px", textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 21, fontFamily: DISPLAY }}>High Country Powersports</div>
              <div style={{ fontSize: 13 }}>245 West 990 North</div>
              <div style={{ fontSize: 13 }}>Orem, Utah 84057</div>
            </div>
            <div style={{ width: 240, padding: "14px 16px" }}>
              <div style={{ fontStyle: "italic", fontWeight: 700, fontSize: 30, textAlign: "right", marginBottom: 8, fontFamily: DISPLAY }}>Invoice</div>
              <div style={{ display: "flex", marginBottom: 4 }}>
                <span style={{ ...bar, minWidth: 70 }}>Number</span>
                <input value={m.number} onChange={set("number")} placeholder="—" style={boxInp} />
              </div>
              <div style={{ display: "flex" }}>
                <span style={{ ...bar, minWidth: 70 }}>Date</span>
                <input value={m.date} onChange={set("date")} style={boxInp} />
              </div>
            </div>
          </div>

          {/* bill to */}
          <div style={{ marginTop: 16 }}>
            <span style={{ ...bar, display: "inline-block", minWidth: 220 }}>Bill To</span>
            <div style={{ fontSize: 13, fontFamily: BODY, marginTop: 4, whiteSpace: "pre-line", minHeight: 60 }}>
              {billTo.join("\n")}
            </div>
          </div>

          {/* terms row */}
          <div style={{ display: "flex", gap: 0, marginTop: 12 }}>
            {[["Terms", "terms"], ["Customer #", "customerNum"], ["Service Rep", "rep"]].map(([label, key]) => (
              <div key={key} style={{ flex: 1 }}>
                <span style={{ ...bar, display: "block" }}>{label}</span>
                <input value={m[key]} onChange={set(key)} style={{ ...cellInp, borderBottom: "none" }} />
              </div>
            ))}
          </div>

          {/* line items */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", ...bar }}>
              <span style={{ flex: 3 }}>Description</span>
              <span style={{ flex: 1, textAlign: "center" }}>Qty / Hours</span>
              <span style={{ flex: 1, textAlign: "center" }}>Price / Rate</span>
              <span style={{ width: 44, textAlign: "center" }}>Tax1</span>
              <span style={{ flex: 1, textAlign: "right" }}>Amount</span>
              <span className="no-print" style={{ width: 24 }} />
            </div>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #eee" }}>
                <input value={l.desc} onChange={(e) => setLine(i, "desc", e.target.value)} placeholder="Description" style={{ ...cellInp, flex: 3, borderBottom: "none" }} />
                <input value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} inputMode="decimal" style={{ ...cellInp, flex: 1, textAlign: "center", borderBottom: "none" }} />
                <input value={l.rate} onChange={(e) => setLine(i, "rate", e.target.value)} inputMode="decimal" placeholder="0.00" style={{ ...cellInp, flex: 1, textAlign: "center", borderBottom: "none" }} />
                <span onClick={() => setLine(i, "tax", !l.tax)} style={{ width: 44, textAlign: "center", cursor: "pointer", fontWeight: 700, color: l.tax ? C.teal : "#bbb" }}>{l.tax ? "✓" : "—"}</span>
                <span style={{ flex: 1, textAlign: "right", fontSize: 13, fontFamily: BODY, paddingRight: 4 }}>{money(amount(l))}</span>
                <button className="no-print" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ width: 24, color: C.red, fontSize: 14 }}>✕</button>
              </div>
            ))}
            <button className="no-print" onClick={() => setLines([...lines, { desc: "", qty: "1", rate: "", tax: true }])} style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: C.teal, fontFamily: BODY }}>+ Add line</button>
          </div>

          {/* totals */}
          <div style={{ display: "flex", gap: 24, marginTop: 24, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              {totRow("Amount Paid", 0, <input value={m.amountPaid} onChange={set("amountPaid")} inputMode="decimal" style={{ ...boxInp, textAlign: "right" }} />)}
              {totRow("Amount Due", due)}
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              {totRow("Discount", 0, <input value={m.discount} onChange={set("discount")} inputMode="decimal" style={{ ...boxInp, textAlign: "right" }} />)}
              {totRow("Shipping Cost", 0, <input value={m.shipping} onChange={set("shipping")} inputMode="decimal" style={{ ...boxInp, textAlign: "right" }} />)}
              {totRow("Sub Total", subtotal)}
              {totRow(`Sales Tax ${m.taxRate}% on ${money(taxable)}`, tax)}
              <div style={{ display: "flex", alignItems: "stretch", marginTop: 6 }}>
                <span style={{ ...bar, flex: 1, fontSize: 14 }}>Total</span>
                <span style={{ width: 90, textAlign: "right", fontSize: 15, fontWeight: 700, padding: "3px 4px", fontFamily: BODY }}>{money(total)}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <span style={{ ...bar, display: "inline-block", minWidth: 220 }}>Notes</span>
            <textarea value={m.notes} onChange={set("notes")} rows={4} placeholder="Notes for the customer — warranty terms, recommendations, next service due…" style={{ width: "100%", marginTop: 6, fontFamily: BODY, fontSize: 13, color: "#111", border: "1px solid #ddd", borderRadius: 4, padding: "8px 10px", background: "#fff", boxSizing: "border-box", resize: "vertical" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
