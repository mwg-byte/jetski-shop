import { useState, useEffect, useMemo } from "react";
import { supabase, C, DISPLAY, BODY, fmtDate } from "../lib/supabase";
import { Card, Row, TextInput, Label, SectionTitle, btn, btnSm } from "../lib/ui";
import { useAuth } from "../AuthContext";
import { SkiEditor, blankSki, cleanSkis } from "./WorkOrders";

const money = (n) => "$" + (Number(n) || 0).toFixed(2);
const quoteTotal = (d) => {
  const lines = Array.isArray(d?.lines) ? d.lines : [];
  const mm = d?.m || {};
  const amt = (l) => (Number(l.qty) || 0) * (Number(l.rate) || 0);
  const sub = lines.reduce((a, l) => a + amt(l), 0);
  const taxable = lines.filter((l) => l.tax).reduce((a, l) => a + amt(l), 0);
  const tax = taxable * (Number(mm.taxRate) || 0) / 100;
  return sub - (Number(mm.discount) || 0) + (Number(mm.shipping) || 0) + tax;
};
const unitText = (o) => {
  const skis = Array.isArray(o.skis) ? o.skis : [];
  if (skis.length) return skis.map((s) => [s.type, s.year, s.make, s.model].filter(Boolean).join(" ")).filter(Boolean).join(" · ");
  return [o.year, o.make, o.model].filter(Boolean).join(" ");
};

export default function Limbo({ orders = [], crew = [], onChange, onOpen, onBack }) {
  const { profile } = useAuth();
  const isMgr = ["owner", "manager"].includes(profile.role);
  const [showNew, setShowNew] = useState(false);
  const [f, setF] = useState({ customer_name: "", customer_phone: "" });
  const [skis, setSkis] = useState([blankSki()]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [totals, setTotals] = useState({}); // order_id -> summed quote total

  // Pull quote totals for the limbo orders so each card can show what was quoted.
  useEffect(() => {
    const ids = orders.map((o) => o.id);
    if (!ids.length) { setTotals({}); return; }
    (async () => {
      const { data } = await supabase.from("invoices").select("order_id, data").in("order_id", ids);
      const t = {};
      (data || []).forEach((inv) => { t[inv.order_id] = (t[inv.order_id] || 0) + quoteTotal(inv.data); });
      setTotals(t);
    })();
  }, [orders.map((o) => o.id).join(",")]);

  const sorted = useMemo(
    () => orders.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [orders]
  );

  async function create() {
    setBusy(true); setErr("");
    const list = cleanSkis(skis);
    const s0 = list[0] || {};
    const issue = list.length > 1
      ? list.map((s) => { const lbl = [s.type, s.year, s.make, s.model].filter(Boolean).join(" ") || "Unit"; return s.issue ? `${lbl}: ${s.issue}` : null; }).filter(Boolean).join("\n")
      : (s0.issue || "");
    const { error } = await supabase.from("work_orders").insert({
      customer_name: f.customer_name.trim(), customer_phone: f.customer_phone.trim(), issue,
      skis: list, limbo: true, priority: 0, status: "intake",
      year: s0.year || "", make: s0.make || "", model: s0.model || "", hull_id: s0.hull_id || "", registration: s0.registration || "",
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setF({ customer_name: "", customer_phone: "" }); setSkis([blankSki()]); setShowNew(false);
    onChange && onChange();
  }

  // Customer committed and the ski is here — start the shop clock now and drop it
  // into the normal work-order flow.
  async function bringIn(o) {
    if (!confirm(`Bring ${o.customer_name}'s ${unitText(o) || "ski"} into the shop? Its time-in-shop clock starts now.`)) return;
    await supabase.from("work_orders").update({
      limbo: false, status: "intake", created_at: new Date().toISOString(),
      priority: Math.floor(Date.now() / 1000), // pushes it to the bottom of the shop list
    }).eq("id", o.id);
    onChange && onChange();
    onOpen(o.id);
  }

  async function remove(o) {
    if (!confirm(`Delete ${o.customer_name}'s limbo quote? This can't be undone.`)) return;
    await supabase.from("work_orders").delete().eq("id", o.id);
    onChange && onChange();
  }

  const canCreate = f.customer_name.trim() && skis.some((s) => (s.issue || "").trim() || (s.make || "").trim() || (s.model || "").trim());

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start", marginTop: 8 }}>
        <div>
          <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink }}>Limbo</h2>
          <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY, maxWidth: 560 }}>
            Skis you've quoted but that aren't here yet — waiting on the customer to say yes and drop it off. These stay out of the shop lists and don't count as time in the shop until you bring them in.
          </p>
        </div>
        <button onClick={() => setShowNew((v) => !v)} style={btn(C.orange)}>{showNew ? "Close" : "+ New limbo quote"}</button>
      </Row>

      {showNew && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginTop: 8, background: "#F6F8F9" }}>
          <h3 style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginBottom: 10 }}>New limbo quote</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div><Label>Customer name *</Label><TextInput value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} /></div>
            <div><Label>Phone</Label><TextInput value={f.customer_phone} onChange={(e) => setF({ ...f, customer_phone: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Label>Units</Label>
            <SkiEditor skis={skis} onChange={setSkis} />
          </div>
          <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 10 }}>
            After you create it, open the card to build the actual quote (Quotes / Invoices) — the quoted total then shows up here.
          </div>
          {err && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY, marginTop: 8 }}>{err}</div>}
          <Row style={{ marginTop: 14 }}>
            <button disabled={!canCreate || busy} onClick={create} style={{ ...btn(C.orange), opacity: !canCreate || busy ? 0.4 : 1 }}>{busy ? "Saving…" : "Create limbo quote"}</button>
            <button onClick={() => setShowNew(false)} style={{ fontSize: 14, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Cancel</button>
          </Row>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {sorted.length === 0 ? (
          <Card style={{ textAlign: "center", padding: 32, borderStyle: "dashed" }}>
            <div style={{ fontFamily: BODY, fontSize: 14, color: C.slate }}>Nothing in limbo. Quotes waiting on a customer will live here.</div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sorted.map((o) => {
              const waiting = o.created_at ? Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000) : null;
              const wColor = waiting == null ? C.slate : waiting >= 14 ? C.red : waiting >= 7 ? C.orange : C.slate;
              const total = totals[o.id];
              const phone = (o.customer_phone || "").replace(/[^\d+]/g, "");
              return (
                <div key={o.id} style={{ border: `1px solid ${C.line}`, borderRadius: 8, background: C.card, overflow: "hidden" }}>
                  <Row style={{ justifyContent: "space-between", alignItems: "flex-start", padding: 12, gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => onOpen(o.id)} style={{ textAlign: "left", fontFamily: BODY, flex: 1, minWidth: 200 }}>
                      <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: C.ink }}>{o.customer_name}</div>
                      <div style={{ fontSize: 13, color: C.slate }}>{unitText(o) || "—"}</div>
                      {o.issue && <div style={{ fontSize: 13, color: C.slate, marginTop: 2, whiteSpace: "pre-line" }}>{o.issue}</div>}
                      <Row style={{ gap: 10, marginTop: 6 }}>
                        {total != null && <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: C.teal + "1A", color: C.teal }}>Quoted {money(total)}</span>}
                        {o.customer_contacted && <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999, background: C.green + "1A", color: C.green }}>Contacted</span>}
                        {waiting != null && <span style={{ fontSize: 12, color: wColor, fontWeight: 700 }}>waiting {waiting}d</span>}
                      </Row>
                    </button>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <button onClick={() => bringIn(o)} style={btnSm(C.orange)}>Bring into shop →</button>
                      {phone && <a href={`sms:${phone}`} style={{ ...btnSm("#fff", C.ink), border: `1px solid ${C.line}`, textDecoration: "none" }}>Text</a>}
                      {phone && <a href={`tel:${phone}`} style={{ ...btnSm("#fff", C.ink), border: `1px solid ${C.line}`, textDecoration: "none" }}>Call</a>}
                      {isMgr && <button onClick={() => remove(o)} style={{ fontSize: 12, color: C.red, fontFamily: BODY }}>delete</button>}
                    </div>
                  </Row>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
