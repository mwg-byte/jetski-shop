import { useState, useEffect, useRef } from "react";
import { supabase, C, DISPLAY, BODY, STAGES, stageOf, PART_STATUSES, PART_COLORS, TEST_RESULTS, TEST_COLORS, REPAIR_STATUSES, today, round2, fmtDate, fmtElapsed } from "../lib/supabase";
import { Card, Row, TextInput, Select, Label, SectionTitle, StatusChip, btn, btnSm, LiveDot, inputStyle } from "../lib/ui";
import { useAuth } from "../AuthContext";
import Invoice from "./Invoice";
import Inspection from "./Inspection";
import { SkiEditor, blankSki, cleanSkis, rid } from "./WorkOrders";
import RepairOrder from "./RepairOrder";

const nameOf = (crew, id) => crew.find((t) => t.id === id)?.display_name || "—";
const skisOf = (o) => (Array.isArray(o?.skis) && o.skis.length)
  ? o.skis
  : (o && (o.year || o.make || o.model || o.hull_id || o.registration)
      ? [{ type: o.type || "", year: o.year || "", make: o.make || "", model: o.model || "", hull_id: o.hull_id || "", registration: o.registration || "" }]
      : []);
const skiLabel = (s) => [s.year, s.make, s.model].filter(Boolean).join(" ");
// Leads with the registration (then HIN) so two of the same make/model can be told apart.
const skiPickLabel = (s, i) => {
  const name = [s.year, s.make, s.model].filter(Boolean).join(" ");
  const reg = s.registration ? `Reg ${s.registration}` : (s.hull_id ? `HIN ${s.hull_id}` : "");
  if (reg && name) return `${reg} — ${name}`;
  return reg || name || `Unit ${(i ?? 0) + 1}`;
};
const unitLabel = (s) => [s.type, s.year, s.make, s.model].filter(Boolean).join(" ");
const quoteTotal = (d) => {
  const lines = Array.isArray(d?.lines) ? d.lines : [];
  const mm = d?.m || {};
  const amt = (l) => (Number(l.qty) || 0) * (Number(l.rate) || 0);
  const sub = lines.reduce((a, l) => a + amt(l), 0);
  const taxable = lines.filter((l) => l.tax).reduce((a, l) => a + amt(l), 0);
  const tax = taxable * (Number(mm.taxRate) || 0) / 100;
  return sub - (Number(mm.discount) || 0) + (Number(mm.shipping) || 0) + tax;
};

function QuotesPanel({ quotes, skis, isMaint, onOpen, onNew, onDelete }) {
  const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
  const unitById = (id) => skis.find((s) => s.id === id);
  return (
    <div style={{ marginTop: 14, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, background: "#F6F8F9" }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginBottom: quotes.length ? 8 : 6 }}>Quotes / Invoices</div>
      {quotes.length === 0 && <div style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginBottom: 10 }}>No quotes yet. Make one for the whole order, or a separate quote per unit.</div>}
      {quotes.map((qt) => {
        const u = unitById(qt.unit_id);
        const label = qt.title || (u ? (unitLabel(u) || "Unit") : "Full order");
        return (
          <div key={qt.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 6, marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
              <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>{money(quoteTotal(qt.data))}{qt.updated_at ? ` · ${fmtDate(qt.updated_at)}` : ""}</div>
            </div>
            <button onClick={() => onOpen(qt.id)} style={{ fontSize: 13, fontWeight: 700, color: C.teal, fontFamily: BODY }}>Open</button>
            <button onClick={() => { if (window.confirm(`Delete quote "${label}"?`)) onDelete(qt.id); }} style={{ fontSize: 14, color: C.red }}>✕</button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => onNew(null)} style={{ fontSize: 12, fontWeight: 700, fontFamily: BODY, padding: "6px 12px", borderRadius: 6, background: C.teal, color: "#fff" }}>+ Quote: full order</button>
        {!isMaint && skis.map((s, i) => (
          <button key={s.id || i} onClick={() => onNew(s)} style={{ fontSize: 12, fontWeight: 700, fontFamily: BODY, padding: "6px 12px", borderRadius: 6, background: C.paleTeal, color: C.teal }}>
            + Quote: {unitLabel(s) || `Unit ${i + 1}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function loadXLSX() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error("Could not load the Excel library — check your connection and try again."));
    document.head.appendChild(s);
  });
}

export default function OrderDetail({ orderId, crew, onBack, canDelete, settings }) {
  const { profile } = useAuth();
  const [order, setOrder] = useState(null);
  const [hours, setHours] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [parts, setParts] = useState([]);
  const [notes, setNotes] = useState([]);
  const [media, setMedia] = useState([]);
  const [lakeTests, setLakeTests] = useState([]);
  const [lakeSession, setLakeSession] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [rates, setRates] = useState({});
  const [tab, setTab] = useState("job");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [openQuoteId, setOpenQuoteId] = useState(null);
  const [showInspection, setShowInspection] = useState(false);
  const [detForm, setDetForm] = useState({});
  const [, tick] = useState(0);

  async function loadAll() {
    const [o, h, s, p, m, lt, ls, oa, no, pr] = await Promise.all([
      supabase.from("work_orders").select("*").eq("id", orderId).single(),
      supabase.from("hour_entries").select("*").eq("order_id", orderId).order("work_date"),
      supabase.from("job_sessions").select("*").eq("order_id", orderId),
      supabase.from("parts").select("*").eq("order_id", orderId),
      supabase.from("media").select("*").eq("order_id", orderId).order("created_at"),
      supabase.from("lake_tests").select("*").eq("order_id", orderId).order("test_date"),
      supabase.from("lake_sessions").select("*").eq("order_id", orderId).maybeSingle(),
      supabase.from("order_assignees").select("tech_id").eq("order_id", orderId),
      supabase.from("order_notes").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
      supabase.from("pay_rates").select("tech_id, hourly_rate"),
    ]);
    let ord = o.data;
    if (ord && Array.isArray(ord.skis) && ord.skis.length > 1 && ord.skis.some((k) => !k.id)) {
      const withIds = ord.skis.map((k) => (k.id ? k : { ...k, id: rid() }));
      await supabase.from("work_orders").update({ skis: withIds }).eq("id", orderId);
      ord = { ...ord, skis: withIds };
    }
    setOrder(ord); setHours(h.data || []); setSessions(s.data || []); setParts(p.data || []);
    setMedia(m.data || []); setLakeTests(lt.data || []); setLakeSession(ls.data || null);
    setAssignees((oa.data || []).map((r) => r.tech_id));
    setNotes(no.data || []);
    const rmap = {}; (pr.data || []).forEach((r) => { rmap[r.tech_id] = Number(r.hourly_rate) || 0; }); setRates(rmap);
  }
  async function loadQuotes() {
    const { data } = await supabase.from("invoices").select("id, title, unit_id, data, updated_at").eq("order_id", orderId).order("updated_at");
    setQuotes(data || []);
  }
  useEffect(() => { loadAll(); loadQuotes(); }, [orderId]);

  async function createQuote(unit) {
    const unitId = unit?.id || "";
    const title = unit ? (unitLabel(unit) || "Unit") : "Full order";
    const { data, error } = await supabase.from("invoices")
      .insert({ order_id: orderId, unit_id: unitId, title, data: {} })
      .select("id, title, unit_id, data, updated_at").single();
    if (!error && data) { setQuotes((qs) => [...qs, data]); setOpenQuoteId(data.id); }
  }
  async function deleteQuote(id) {
    await supabase.from("invoices").delete().eq("id", id);
    setQuotes((qs) => qs.filter((q) => q.id !== id));
  }

  useEffect(() => {
    if (!sessions.length && !lakeSession) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [sessions.length, !!lakeSession]);

  if (!order) return <div style={{ padding: 40, textAlign: "center", color: C.slate, fontFamily: BODY, fontSize: 14 }}>Loading…</div>;

  const skis = skisOf(order);
  const intakeDays = order.created_at ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / 86400000) : null;
  const shopRateGlobal = Number(settings?.shop_rate) || 0;
  const shopRate = order.shop_rate_override != null && order.shop_rate_override !== "" ? Number(order.shop_rate_override) : shopRateGlobal;

  const patchOrder = async (patch) => {
    const full = { ...patch };
    if ("status" in patch) {
      full.closed_at = patch.status === "closed" ? new Date().toISOString() : null;
      const wasRepair = REPAIR_STATUSES.includes(order.status);
      const nowRepair = REPAIR_STATUSES.includes(patch.status);
      if (nowRepair && !wasRepair) full.in_repair_started_at = new Date().toISOString();
    }
    setOrder({ ...order, ...full });
    await supabase.from("work_orders").update(full).eq("id", orderId);

    // Notify the invoicer when a job first becomes ready to invoice.
    if ("status" in patch && patch.status === "ready_for_invoice" && order.status !== "ready_for_invoice"
        && settings?.invoicer_id && settings.invoicer_id !== profile.id) {
      const ski = [order.year, order.make, order.model].filter(Boolean).join(" ");
      await supabase.from("dashboard_messages").insert({
        recipient_id: settings.invoicer_id, sender_id: profile.id,
        body: `Ready for invoice: ${order.customer_name}${ski ? " — " + ski : ""}. It's in your Ready-for-invoice list.`,
      });
    }
  };
  function openDetails() {
    const sk = skisOf(order).map((s) => ({ id: s.id, type: s.type || "", year: s.year || "", make: s.make || "", model: s.model || "", hull_id: s.hull_id || "", registration: s.registration || "", issue: s.issue || "" }));
    if (sk.length && !sk.some((s) => s.issue) && (order.issue || "").trim()) sk[0].issue = order.issue;
    setDetForm({
      customer_name: order.customer_name || "", customer_phone: order.customer_phone || "",
      issue: order.issue || "", skis: sk.length ? sk : [blankSki()],
    });
    setEditingDetails(true);
  }
  async function saveDetails() {
    if (!detForm.customer_name.trim()) return;
    let patch;
    if (order.kind === "maintenance") {
      patch = { customer_name: detForm.customer_name.trim(), issue: detForm.issue.trim() || detForm.customer_name.trim() };
    } else {
      const list = cleanSkis(detForm.skis || []);
      const s0 = list[0] || {};
      const issue = list.length > 1
        ? list.map((s) => { const lbl = [s.type, s.year, s.make, s.model].filter(Boolean).join(" ") || "Unit"; return s.issue ? `${lbl}: ${s.issue}` : null; }).filter(Boolean).join("\n")
        : (s0.issue || "");
      patch = {
        customer_name: detForm.customer_name.trim(), customer_phone: detForm.customer_phone.trim(), issue,
        skis: list, year: s0.year || "", make: s0.make || "", model: s0.model || "", hull_id: s0.hull_id || "", registration: s0.registration || "",
      };
    }
    setOrder({ ...order, ...patch });
    setEditingDetails(false);
    await supabase.from("work_orders").update(patch).eq("id", orderId);
  }
  const totalHrs = round2(hours.reduce((s, h) => s + Number(h.hours), 0));

  return (
    <Card>
      <Row style={{ justifyContent: "space-between" }}>
        <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
        {canDelete && (confirmDelete ? (
          <Row>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.red, fontFamily: BODY }}>Delete order and all media?</span>
            <button onClick={async () => {
              for (const m of media) await supabase.storage.from("job-media").remove([m.path]);
              await supabase.from("work_orders").delete().eq("id", orderId);
              onBack();
            }} style={btnSm(C.red)}>Yes, delete</button>
            <button onClick={() => setConfirmDelete(false)} style={{ fontSize: 12, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Keep it</button>
          </Row>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ fontSize: 12, fontWeight: 600, color: C.red, fontFamily: BODY }}>Delete order</button>
        ))}
      </Row>

      <Row style={{ justifyContent: "space-between", alignItems: "flex-start", marginTop: 12 }}>
        <div>
          <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, lineHeight: 1.1 }}>{order.customer_name}</h2>
          <div style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
            {skis.length > 0 ? skiLabel(skis[0]) : ""}{skis.length > 1 ? ` · +${skis.length - 1} more` : ""}{order.customer_phone && ` · ${order.customer_phone}`}
          </div>
        </div>
        <StatusChip status={order.status} big />
      </Row>
      <Row style={{ marginTop: 8, gap: 12, fontSize: 12, color: C.slate, fontFamily: BODY }}>
        <span>Intake <b style={{ color: C.ink }}>{fmtDate(order.created_at)}</b></span>
        <span>Picked up <b style={{ color: C.ink }}>{order.closed_at ? fmtDate(order.closed_at) : "—"}</b></span>
        {!order.closed_at && intakeDays != null && <span style={{ color: intakeDays >= 30 ? C.red : intakeDays >= 14 ? C.orange : C.slate, fontWeight: 700 }}>{intakeDays}d in shop</span>}
        {REPAIR_STATUSES.includes(order.status) && order.in_repair_started_at && (() => {
          const repairDays = Math.floor((Date.now() - new Date(order.in_repair_started_at).getTime()) / 86400000);
          return <span style={{ color: repairDays >= 14 ? C.red : repairDays >= 7 ? C.orange : C.teal, fontWeight: 700 }}>🔧 {repairDays}d in repair</span>;
        })()}
      </Row>
      {order.kind === "maintenance" && (
        <span style={{ display: "inline-block", marginTop: 8, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 999, background: "#A162071A", color: "#A16207" }}>Maintenance task</span>
      )}
      {order.status === "ready" && (
        <div style={{ marginTop: 12 }}>
          <Row style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {order.customer_contacted ? (
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "3px 10px", borderRadius: 999, background: C.green + "1A", color: C.green }}>✓ Customer contacted{order.contacted_at ? ` · ${fmtDate(order.contacted_at)}` : ""}</span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "3px 10px", borderRadius: 999, background: "#B077091A", color: "#B07709" }}>Not contacted yet</span>
            )}
            {canDelete && (
              <button onClick={() => patchOrder(order.customer_contacted ? { customer_contacted: false, contacted_at: null } : { customer_contacted: true, contacted_at: new Date().toISOString() })} style={btnSm(order.customer_contacted ? C.slate : C.green)}>
                {order.customer_contacted ? "Mark not contacted" : "Mark contacted"}
              </button>
            )}
          </Row>
          {order.customer_phone && (
            <div style={{ marginTop: 10 }}>
              <a href={`sms:${order.customer_phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(`Hi ${order.customer_name}, your ${[order.year, order.make, order.model].filter(Boolean).join(" ") || "ski"} is ready for pickup! Give us a call or stop by whenever you're ready. Thanks!`)}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 8, background: C.green, color: "#fff", fontFamily: BODY, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
                Text customer — ready for pickup
              </a>
              <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 4 }}>Opens Messages with a pre-written note to {order.customer_phone}. Review it, then hit send.</div>
            </div>
          )}
        </div>
      )}
      <p style={{ marginTop: 12, fontSize: 14, borderRadius: 6, padding: 12, background: "#F6F8F9", color: C.ink, fontFamily: BODY, border: `1px solid ${C.line}`, whiteSpace: "pre-line" }}>{order.issue}</p>

      {order.kind !== "maintenance" && skis.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginBottom: 6 }}>Units ({skis.length})</div>
          <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
            {skis.map((s, i) => (
              <div key={i} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
                <Row style={{ flexWrap: "wrap", gap: 8 }}>
                  {s.type && <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 999, background: C.paleTeal, color: C.teal }}>{s.type}</span>}
                  <span style={{ fontWeight: 700, color: C.ink }}>{skiLabel(s) || `Unit ${i + 1}`}</span>
                  <span style={{ flex: 1, color: C.slate }}>{[s.hull_id && `HIN ${s.hull_id}`, s.registration && `Reg ${s.registration}`].filter(Boolean).join(" · ")}</span>
                </Row>
                {skis.length > 1 && s.issue && <div style={{ color: C.slate, marginTop: 3, whiteSpace: "pre-wrap" }}>{s.issue}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {canDelete && (editingDetails ? (
        <div style={{ marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, background: "#F6F8F9" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginBottom: 10 }}>Edit details</div>
          {order.kind === "maintenance" ? (
            <>
              <div><Label>Task *</Label><TextInput value={detForm.customer_name} onChange={(e) => setDetForm({ ...detForm, customer_name: e.target.value })} /></div>
              <div style={{ marginTop: 10 }}><Label>Details</Label><textarea value={detForm.issue} onChange={(e) => setDetForm({ ...detForm, issue: e.target.value })} rows={3} style={{ width: "100%", fontFamily: BODY, fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 12px", background: "#FBFCFD" }} /></div>
            </>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                <div><Label>Customer name *</Label><TextInput value={detForm.customer_name} onChange={(e) => setDetForm({ ...detForm, customer_name: e.target.value })} /></div>
                <div><Label>Phone</Label><TextInput value={detForm.customer_phone} onChange={(e) => setDetForm({ ...detForm, customer_phone: e.target.value })} /></div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Label>Units</Label>
                <SkiEditor skis={detForm.skis || []} onChange={(skis) => setDetForm({ ...detForm, skis })} />
              </div>
            </>
          )}
          <Row style={{ marginTop: 12 }}>
            <button onClick={saveDetails} disabled={!detForm.customer_name?.trim()} style={{ ...btn(C.teal), opacity: !detForm.customer_name?.trim() ? 0.4 : 1 }}>Save details</button>
            <button onClick={() => setEditingDetails(false)} style={{ fontSize: 14, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Cancel</button>
          </Row>
        </div>
      ) : (
        <button onClick={openDetails} style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: C.teal, fontFamily: BODY }}>Edit details</button>
      ))}
      {!editingDetails && (
        <button onClick={() => setShowInspection(true)} style={{ marginTop: 10, marginLeft: 12, fontSize: 13, fontWeight: 600, color: C.teal, fontFamily: BODY }}>Drop-off / pick-up inspection</button>
      )}

      {canDelete && !editingDetails && (
        <QuotesPanel quotes={quotes} skis={skis} isMaint={order.kind === "maintenance"} onOpen={setOpenQuoteId} onNew={createQuote} onDelete={deleteQuote} />
      )}
      {openQuoteId && <Invoice quoteId={openQuoteId} order={order} parts={parts} hours={hours} shopRate={shopRate} onClose={() => { setOpenQuoteId(null); loadQuotes(); }} />}
      {showInspection && <Inspection order={order} canEdit={canDelete} onClose={() => setShowInspection(false)} />}

      {/* tabs */}
      <div style={{ display: "flex", gap: 4, marginTop: 16, borderBottom: `2px solid ${C.line}` }}>
        {(order.kind === "maintenance" ? [{ key: "job", label: "Job" }, { key: "todo", label: "Tech to do" }] : [{ key: "job", label: "Job" }, { key: "todo", label: "Tech to do" }, { key: "lake", label: `Lake testing${lakeTests.length ? ` (${lakeTests.length})` : ""}` }]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
            padding: "8px 14px", borderRadius: "6px 6px 0 0",
            background: tab === t.key ? C.ink : "transparent", color: tab === t.key ? "#fff" : C.slate,
          }}>
            {t.label}{t.key === "lake" && lakeSession && <span style={{ marginLeft: 6 }}><LiveDot color="#38BDF8" /></span>}
          </button>
        ))}
      </div>

      {tab === "todo" ? (
        <TodoTab {...{ quotes, setQuotes, profile }} />
      ) : tab === "lake" && order.kind !== "maintenance" ? (
        <LakeTab {...{ orderId, crew, profile, lakeTests, setLakeTests, lakeSession, setLakeSession }} />
      ) : (
        <JobTab {...{ order, crew, profile, hours, setHours, sessions, setSessions, parts, setParts, notes, setNotes, media, setMedia, patchOrder, totalHrs, orderId, assignees, setAssignees, rates, isMgr: canDelete, shopRate, shopRateGlobal }} />
      )}
    </Card>
  );
}

/* ================= TECH TO DO TAB ================= */
/* Jobs are pulled straight from the invoice line items; each can be checked off. */
function TodoTab({ quotes, setQuotes, profile }) {
  const jobs = [];
  quotes.forEach((q) => {
    const lines = Array.isArray(q.data?.lines) ? q.data.lines : [];
    lines.forEach((l, idx) => {
      if ((l.desc || "").trim()) jobs.push({ quoteId: q.id, quoteTitle: q.title || "Invoice", idx, desc: l.desc, qty: l.qty, done: !!l.done });
    });
  });
  const doneCount = jobs.filter((j) => j.done).length;

  async function toggle(job) {
    const q = quotes.find((x) => x.id === job.quoteId);
    if (!q) return;
    const lines = (q.data?.lines || []).map((l, i) => (i === job.idx
      ? { ...l, done: !l.done, done_by: !l.done ? profile.id : null, done_at: !l.done ? new Date().toISOString() : null }
      : l));
    const newData = { ...(q.data || {}), lines };
    setQuotes((qs) => qs.map((x) => (x.id === q.id ? { ...x, data: newData } : x)));
    await supabase.from("invoices").update({ data: newData }).eq("id", q.id);
  }

  if (quotes.length === 0) {
    return <div style={{ marginTop: 16, fontSize: 14, color: C.slate, fontFamily: BODY }}>No invoice yet. Create a quote/invoice for this order and its line items will show up here as jobs to check off.</div>;
  }
  if (jobs.length === 0) {
    return <div style={{ marginTop: 16, fontSize: 14, color: C.slate, fontFamily: BODY }}>The invoice has no line items yet. Add descriptions on the invoice and they'll appear here.</div>;
  }

  const byQuote = {};
  jobs.forEach((j) => { (byQuote[j.quoteId] = byQuote[j.quoteId] || { title: j.quoteTitle, items: [] }).items.push(j); });

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, textTransform: "uppercase", color: C.ink }}>Tech to do</div>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: BODY, color: doneCount === jobs.length ? C.green : C.slate }}>{doneCount} / {jobs.length} done</div>
      </div>
      <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginBottom: 10 }}>Pulled from the invoice line items. Check each off as it's completed.</div>
      {Object.entries(byQuote).map(([qid, grp]) => (
        <div key={qid} style={{ marginBottom: 14 }}>
          {quotes.length > 1 && <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: C.slate, fontFamily: BODY, marginBottom: 4 }}>{grp.title}</div>}
          {grp.items.map((j) => (
            <label key={j.quoteId + "-" + j.idx} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={j.done} onChange={() => toggle(j)} style={{ marginTop: 3, width: 18, height: 18, cursor: "pointer" }} />
              <span style={{ flex: 1, fontFamily: BODY, fontSize: 14, color: j.done ? C.slate : C.ink, textDecoration: j.done ? "line-through" : "none" }}>
                {j.desc}{Number(j.qty) > 1 ? <span style={{ color: C.slate }}> × {j.qty}</span> : null}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ================= JOB TAB ================= */
function JobTab({ order, crew, profile, hours, setHours, sessions, setSessions, parts, setParts, notes, setNotes, media, setMedia, patchOrder, totalHrs, orderId, assignees, setAssignees, rates, isMgr, shopRate, shopRateGlobal }) {
  const [hourForm, setHourForm] = useState({ tech_id: profile.id, work_date: today(), hours: "", note: "", ski_id: "" });
  const [partForm, setPartForm] = useState({ name: "", qty: "1", sku: "", note: "", ski_id: "", cost: "" });
  const [takenForm, setTakenForm] = useState({ name: "", qty: "1", sku: "", note: "", ski_id: "", cost: "" });
  const [editPartId, setEditPartId] = useState(null);
  const [editPartVals, setEditPartVals] = useState({ name: "", qty: "1", sku: "", note: "", ski_id: "", status: "requested", eta: "", cost: "", price: "", warranty: "" });
  const [noteText, setNoteText] = useState("");
  const [noteSki, setNoteSki] = useState("");
  const [mediaSki, setMediaSki] = useState("");
  const [editHourId, setEditHourId] = useState(null);
  const [editHourVals, setEditHourVals] = useState({ hours: "", work_date: "" });
  const [clockTech, setClockTech] = useState(profile.id);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const fileRef = useRef(null);
  const [repairTotal, setRepairTotal] = useState(order.repair_total != null ? String(order.repair_total) : "");
  const [deposit, setDeposit] = useState(order.deposit_amount != null ? String(order.deposit_amount) : "");
  const [schedDate, setSchedDate] = useState(order.scheduled_date ? String(order.scheduled_date).slice(0, 10) : "");
  const [estHours, setEstHours] = useState(order.est_hours != null ? String(order.est_hours) : "");
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState("");
  const [payLink, setPayLink] = useState("");
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [shopRateInput, setShopRateInput] = useState(order.shop_rate_override != null ? String(order.shop_rate_override) : "");

  const publicUrl = (path) => supabase.storage.from("job-media").getPublicUrl(path).data.publicUrl;

  // --- shared parts helpers (repair-order table + "Parts taken" edit the same rows) ---
  const patchPartLocal = (id, patch) => setParts((ps) => ps.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const commitPart = async (id, patch) => { await supabase.from("parts").update(patch).eq("id", id); };
  const updatePart = async (id, patch) => { patchPartLocal(id, patch); await commitPart(id, patch); };
  async function addTakenPart(vals = {}) {
    const { data } = await supabase.from("parts").insert({
      order_id: orderId, kind: "taken",
      name: (vals.name || "").trim(), qty: Number(vals.qty) || 1, sku: (vals.sku || "").trim(),
      note: (vals.note || "").trim(), ski_id: vals.ski_id || null,
      cost: vals.cost === "" || vals.cost == null ? null : Number(vals.cost),
      price: vals.price === "" || vals.price == null ? null : Number(vals.price),
      warranty: vals.warranty || "",
    }).select().single();
    if (data) setParts((ps) => [...ps, data]);
    return data;
  }
  async function deletePart(id) { setParts((ps) => ps.filter((x) => x.id !== id)); await supabase.from("parts").delete().eq("id", id); }

  async function clockIn() {
    const { data, error } = await supabase.from("job_sessions").insert({ order_id: orderId, tech_id: clockTech }).select().single();
    if (!error) setSessions([...sessions, data]);
  }
  async function clockOut(s) {
    const ms = Date.now() - new Date(s.started_at).getTime();
    const { data } = await supabase.from("hour_entries").insert({
      order_id: orderId, tech_id: s.tech_id, work_date: today(),
      hours: Math.max(0.01, round2(ms / 3600000)), note: `Clocked session (${fmtElapsed(ms)})`, clocked: true,
    }).select().single();
    await supabase.from("job_sessions").delete().eq("id", s.id);
    setSessions(sessions.filter((x) => x.id !== s.id));
    if (data) setHours([...hours, data]);
  }
  async function addHours() {
    const h = Number(hourForm.hours);
    if (!hourForm.tech_id || !h || h <= 0) return;
    const { data } = await supabase.from("hour_entries").insert({ order_id: orderId, ...hourForm, hours: h }).select().single();
    if (data) { setHours([...hours, data]); setHourForm({ ...hourForm, hours: "", note: "" }); }
  }
  async function addPart() {
    if (!partForm.name.trim()) return;
    const { data } = await supabase.from("parts").insert({ order_id: orderId, name: partForm.name.trim(), qty: Number(partForm.qty) || 1, sku: partForm.sku.trim(), note: partForm.note.trim(), ski_id: partForm.ski_id || null, cost: partForm.cost === "" ? null : Number(partForm.cost), kind: "request" }).select().single();
    if (data) { setParts([...parts, data]); setPartForm({ name: "", qty: "1", sku: "", note: "", ski_id: partForm.ski_id, cost: "" }); }
  }
  async function addTaken() {
    if (!takenForm.name.trim()) return;
    const { data } = await supabase.from("parts").insert({ order_id: orderId, name: takenForm.name.trim(), qty: Number(takenForm.qty) || 1, sku: takenForm.sku.trim(), note: takenForm.note.trim(), ski_id: takenForm.ski_id || null, cost: takenForm.cost === "" ? null : Number(takenForm.cost), kind: "taken", created_at: new Date().toISOString() }).select().single();
    if (data) { setParts([...parts, data]); setTakenForm({ name: "", qty: "1", sku: "", note: "", ski_id: takenForm.ski_id, cost: "" }); }
  }
  async function addNote() {
    const body = noteText.trim();
    if (!body) return;
    const { data } = await supabase.from("order_notes").insert({ order_id: orderId, author_id: profile.id, body, ski_id: noteSki || null }).select().single();
    if (data) { setNotes([data, ...notes]); setNoteText(""); }
  }
  async function removeNote(n) {
    setNotes(notes.filter((x) => x.id !== n.id));
    await supabase.from("order_notes").delete().eq("id", n.id);
  }
  function startEditHour(h) {
    setEditHourId(h.id);
    setEditHourVals({ hours: String(h.hours), work_date: h.work_date });
  }
  async function saveHour(h) {
    const val = Number(editHourVals.hours);
    if (!val || val <= 0) return;
    const patch = { hours: val, work_date: editHourVals.work_date };
    setHours(hours.map((x) => (x.id === h.id ? { ...x, ...patch } : x)));
    setEditHourId(null);
    await supabase.from("hour_entries").update(patch).eq("id", h.id);
  }
  async function cyclePart(p) {
    const status = PART_STATUSES[(PART_STATUSES.indexOf(p.status) + 1) % PART_STATUSES.length];
    setParts(parts.map((x) => (x.id === p.id ? { ...x, status } : x)));
    await supabase.from("parts").update({ status }).eq("id", p.id);
  }
  async function setPartEta(p, eta) {
    setParts(parts.map((x) => (x.id === p.id ? { ...x, eta: eta || null } : x)));
    await supabase.from("parts").update({ eta: eta || null }).eq("id", p.id);
  }
  function startEditPart(p) {
    setEditPartId(p.id);
    setEditPartVals({ name: p.name || "", qty: String(p.qty || "1"), sku: p.sku || "", note: p.note || "", ski_id: p.ski_id || "", status: p.status || "requested", eta: p.eta || "", cost: p.cost != null ? String(p.cost) : "", price: p.price != null ? String(p.price) : "", warranty: p.warranty || "" });
  }
  async function saveEditPart(p) {
    const name = editPartVals.name.trim();
    if (!name) return;
    const patch = { name, qty: Number(editPartVals.qty) || 1, sku: editPartVals.sku.trim(), note: editPartVals.note.trim(), ski_id: editPartVals.ski_id || null, status: editPartVals.status, eta: editPartVals.status === "ordered" ? (editPartVals.eta || null) : null, cost: editPartVals.cost === "" ? null : Number(editPartVals.cost), price: editPartVals.price === "" ? null : Number(editPartVals.price), warranty: editPartVals.warranty || "" };
    setParts(parts.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    setEditPartId(null);
    await supabase.from("parts").update(patch).eq("id", p.id);
  }
  async function receivePart(p) {
    const created_at = new Date().toISOString();
    setParts(parts.map((x) => (x.id === p.id ? { ...x, kind: "taken", created_at } : x)));
    setEditPartId(null);
    await supabase.from("parts").update({ kind: "taken", created_at }).eq("id", p.id);
  }
  async function uploadFiles(e) {
    const files = Array.from(e.target.files || []);
    setUploading(true);
    for (const file of files) {
      const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
      if (!kind) continue;
      const path = `${orderId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("job-media").upload(path, file);
      if (!error) {
        const { data } = await supabase.from("media").insert({ order_id: orderId, path, kind, name: file.name, ski_id: mediaSki || null }).select().single();
        if (data) setMedia((m) => [...m, data]);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }
  async function removeMedia(m) {
    setMedia(media.filter((x) => x.id !== m.id));
    await supabase.storage.from("job-media").remove([m.path]);
    await supabase.from("media").delete().eq("id", m.id);
  }

  const requests = parts.filter((p) => (p.kind || "request") === "request");
  const taken = parts.filter((p) => p.kind === "taken");
  const orderSkis = order.kind !== "maintenance" && Array.isArray(order.skis) ? order.skis : [];
  const multiSki = orderSkis.length > 1;
  const skiName = (id) => { if (!id) return null; const i = orderSkis.findIndex((k) => (k.id || "") === id); return i >= 0 ? skiPickLabel(orderSkis[i], i) : null; };
  const skiChip = (id) => { const nm = skiName(id); return nm ? <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999, background: C.paleTeal, color: C.teal, fontFamily: BODY }}>{nm}</span> : null; };
  const SkiPick = ({ value, onChange }) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "auto", minWidth: 120 }}>
      <option value="">All / general</option>
      {orderSkis.map((s, i) => <option key={s.id || i} value={s.id || ""}>{skiPickLabel(s, i)}</option>)}
    </Select>
  );

  const money = (n) => "$" + (Number(n) || 0).toFixed(2);
  const partsCost = round2(parts.reduce((a, p) => a + (Number(p.cost) || 0) * (Number(p.qty) || 1), 0));
  const laborRows = crew.map((t) => {
    const hrs = round2(hours.filter((h) => h.tech_id === t.id).reduce((a, h) => a + Number(h.hours), 0));
    const rate = rates[t.id] || 0;
    return { id: t.id, name: t.display_name, hrs, rate, cost: round2(hrs * rate) };
  }).filter((r) => r.hrs > 0);
  const laborCost = round2(laborRows.reduce((a, r) => a + r.cost, 0));
  const totalCost = round2(partsCost + laborCost);
  // Revenue is pulled straight from the invoices on this order: the sum of every quote/invoice total,
  // computed the same way the invoice screen does (subtotal − discount + shipping + tax).
  const invoiceTotal = (d) => {
    const inv = d || {};
    const ls = Array.isArray(inv.lines) ? inv.lines : [];
    const mm = inv.m || {};
    const amt = (l) => (Number(l.qty) || 0) * (Number(l.rate) || 0);
    const sub = ls.reduce((a, l) => a + amt(l), 0);
    const taxable = ls.filter((l) => l.tax).reduce((a, l) => a + amt(l), 0);
    const tax = taxable * (Number(mm.taxRate) || 0) / 100;
    return sub - (Number(mm.discount) || 0) + (Number(mm.shipping) || 0) + tax;
  };
  const invoicedTotal = round2(quotes.reduce((a, q) => a + invoiceTotal(q.data), 0));
  const repairTotalNum = Number(order.repair_total) || 0;
  // Invoices drive revenue automatically; the typed "repair total" is only a fallback before any invoice exists.
  const revenue = quotes.length ? invoicedTotal : repairTotalNum;
  const depositNum = Number(order.deposit_amount) || 0;
  const profit = round2(revenue - totalCost);
  const balanceDue = round2(revenue - depositNum);
  const partsPriceCustomer = round2(taken.reduce((a, p) => a + (Number(p.price) || 0) * (Number(p.qty) || 1), 0));
  const laborCharge = round2((Number(shopRate) || 0) * (Number(totalHrs) || 0));
  const suggestedCharge = round2(partsPriceCustomer + laborCharge);
  const saveShopRateOverride = () => patchOrder({ shop_rate_override: shopRateInput === "" ? null : Number(shopRateInput) });
  const saveRepairTotal = () => patchOrder({ repair_total: repairTotal === "" ? 0 : Number(repairTotal) });
  const saveDeposit = () => patchOrder({ deposit_amount: deposit === "" ? 0 : Number(deposit) });
  async function requestPayment() {
    const def = balanceDue > 0 ? balanceDue : revenue;
    const input = window.prompt("Amount to charge the customer ($):", def ? String(def) : "");
    if (input == null) return;
    const amt = Number(input);
    if (!amt || amt <= 0) { setPayErr("Enter an amount greater than 0."); return; }
    setPayBusy(true); setPayErr(""); setPayLink("");
    try {
      const label = `Repair — ${order.customer_name || "ski"}`;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/square-payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ amount: amt, name: label, note: `Work order ${orderId}` }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not create payment link.");
      setPayLink(data.url);
      const phone = (order.customer_phone || "").replace(/[^\d+]/g, "");
      const body = encodeURIComponent(`Hi ${order.customer_name}, here's a secure link to pay ${money(amt)} for your ${[order.year, order.make, order.model].filter(Boolean).join(" ") || "ski"} service: ${data.url}`);
      if (phone) window.location.href = `sms:${phone}?&body=${body}`;
    } catch (e) {
      setPayErr(e.message || "Payment link failed.");
    } finally {
      setPayBusy(false);
    }
  }
  function markPaidInFull() {
    if (!window.confirm("Mark this order paid in full?")) return;
    patchOrder({ paid_in_full: true, paid_at: new Date().toISOString(), paid_amount: revenue });
  }
  function unmarkPaid() {
    patchOrder({ paid_in_full: false, paid_at: null, paid_amount: null });
  }
  async function exportCostProfit() {
    setXlsxBusy(true);
    try {
      const XLSX = await loadXLSX();
      const sk = skisOf(order).map(skiLabel).filter(Boolean).join("; ");
      const aoa = [
        ["Work order — cost & profit"],
        ["Customer", order.customer_name || ""],
        ["Ski", sk],
        ["Status", order.status],
        ["Intake", order.created_at ? fmtDate(order.created_at) : ""],
        ["Picked up", order.closed_at ? fmtDate(order.closed_at) : ""],
        ["Paid in full", order.paid_in_full ? (order.paid_at ? fmtDate(order.paid_at) : "Yes") : "No"],
        [],
        ["PARTS", "Qty", "Unit cost", "Line cost"],
      ];
      parts.forEach((p) => aoa.push([p.name, Number(p.qty) || 1, p.cost != null ? round2(Number(p.cost)) : "", round2((Number(p.cost) || 0) * (Number(p.qty) || 1))]));
      aoa.push(["Parts total", "", "", partsCost]);
      aoa.push([]);
      aoa.push(["LABOR", "Hours", "Rate", "Cost"]);
      laborRows.forEach((r) => aoa.push([r.name, r.hrs, r.rate, r.cost]));
      aoa.push(["Labor total", "", "", laborCost]);
      aoa.push([]);
      aoa.push([quotes.length ? "Revenue (invoiced)" : "Repair total", "", "", revenue]);
      aoa.push(["Total cost", "", "", totalCost]);
      aoa.push(["Profit", "", "", profit]);
      aoa.push([]);
      aoa.push(["PRICE TO CHARGE CUSTOMER", "", "", ""]);
      aoa.push(["Parts (customer price)", "", "", partsPriceCustomer]);
      aoa.push([`Labor — ${totalHrs} hrs @ ${shopRate}/hr`, "", "", laborCharge]);
      aoa.push(["Suggested price to charge", "", "", suggestedCharge]);
      aoa.push([]);
      aoa.push(["Down payment", "", "", depositNum]);
      aoa.push(["Balance due", "", "", order.paid_in_full ? 0 : balanceDue]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cost & profit");
      const slug = (order.customer_name || "order").replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, "-").toLowerCase();
      XLSX.writeFile(wb, `cost-profit-${slug}-${today()}.xlsx`);
    } catch (e) {
      window.alert(e.message || "Export failed.");
    } finally {
      setXlsxBusy(false);
    }
  }

  return (
    <>
      <SectionTitle>Time clock</SectionTitle>
      <div style={{ borderRadius: 6, padding: 12, background: C.ink }}>
        {sessions.map((s) => (
          <Row key={s.id} style={{ marginBottom: 8 }}>
            <LiveDot color={C.orange} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: BODY }}>{nameOf(crew, s.tech_id)}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>{fmtElapsed(Date.now() - new Date(s.started_at).getTime())}</span>
            <button onClick={() => clockOut(s)} style={{ ...btnSm(C.orange), marginLeft: "auto" }}>Clock out</button>
          </Row>
        ))}
        <Row>
          <Select value={clockTech} onChange={(e) => setClockTech(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
            {crew.map((t) => <option key={t.id} value={t.id} disabled={sessions.some((s) => s.tech_id === t.id)}>{t.display_name}</option>)}
          </Select>
          <button onClick={clockIn} disabled={sessions.some((s) => s.tech_id === clockTech)} style={btn("#fff", C.ink)}>▶ Clock in</button>
        </Row>
      </div>

      <SectionTitle>Status</SectionTitle>
      <Row style={{ gap: 6 }}>
        {STAGES.map((s, i) => {
          const idx = STAGES.findIndex((x) => x.key === order.status);
          const done = i < idx, current = i === idx;
          return (
            <button key={s.key} onClick={() => patchOrder({ status: s.key })} style={{
              fontFamily: BODY, fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 6,
              background: current ? s.color : done ? s.color + "22" : "#F1F4F6",
              color: current ? "#fff" : done ? s.color : C.slate,
              border: `1px solid ${current || done ? s.color : C.line}`,
            }}>{done ? "✓ " : ""}{s.label}</button>
          );
        })}
      </Row>

      <SectionTitle>Assigned techs</SectionTitle>
      <Row>
        {crew.map((t) => {
          const on = assignees.includes(t.id);
          const canToggle = isMgr || t.id === profile.id;
          return (
            <button key={t.id} disabled={!canToggle} onClick={async () => {
              if (!canToggle) return;
              if (on) {
                setAssignees(assignees.filter((id) => id !== t.id));
                await supabase.from("order_assignees").delete().eq("order_id", orderId).eq("tech_id", t.id);
              } else {
                setAssignees([...assignees, t.id]);
                await supabase.from("order_assignees").insert({ order_id: orderId, tech_id: t.id });
              }
            }} style={{
              fontFamily: BODY, fontSize: 14, fontWeight: 600, padding: "6px 14px", borderRadius: 999,
              background: on ? C.teal : C.paleTeal, color: on ? "#fff" : C.teal,
              opacity: canToggle ? 1 : (on ? 0.9 : 0.4), cursor: canToggle ? "pointer" : "default",
            }}>{on ? "✓ " : ""}{t.display_name}{t.id === profile.id ? " (you)" : ""}</button>
          );
        })}
      </Row>
      <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 4 }}>
        {isMgr ? "Tap to add or remove anyone." : "Tap your own name to join or leave this job. You can't remove a teammate."}
      </div>

      <SectionTitle>Notes</SectionTitle>
      {notes.length > 0 && (
        <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 8, border: `1px solid ${C.line}` }}>
          {notes.map((n) => (
            <div key={n.id} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row style={{ gap: 8, alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: C.ink, fontSize: 13 }}>{nameOf(crew, n.author_id)}</span>
                  {skiChip(n.ski_id)}
                </Row>
                <Row style={{ gap: 8 }}>
                  <span style={{ fontSize: 12, color: C.slate }}>{fmtDate(n.created_at)}</span>
                  {(isMgr || n.author_id === profile.id) && <button onClick={() => removeNote(n)} style={{ fontSize: 12, color: C.red }}>remove</button>}
                </Row>
              </Row>
              <div style={{ fontSize: 14, color: C.ink, marginTop: 2, whiteSpace: "pre-wrap" }}>{n.body}</div>
            </div>
          ))}
        </div>
      )}
      <Row>
        <TextInput placeholder="Add a note — found cracked impeller, customer approved…" value={noteText} onChange={(e) => setNoteText(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        {multiSki && <SkiPick value={noteSki} onChange={setNoteSki} />}
        <button onClick={addNote} style={btn(C.teal)}>Add note</button>
      </Row>

      <SectionTitle right={<span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: BODY }}>{totalHrs} hrs total</span>}>Hour log</SectionTitle>
      {hours.length > 0 && (
        <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 8, border: `1px solid ${C.line}` }}>
          {hours.map((h) => (
            editHourId === h.id ? (
              <Row key={h.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, flexWrap: "wrap", gap: 8, background: "#F6F8F9" }}>
                <span style={{ fontWeight: 600, color: C.ink }}>{nameOf(crew, h.tech_id)}</span>
                <TextInput type="date" value={editHourVals.work_date} onChange={(e) => setEditHourVals({ ...editHourVals, work_date: e.target.value })} style={{ width: "auto" }} />
                <TextInput type="number" step="0.25" min="0" value={editHourVals.hours} onChange={(e) => setEditHourVals({ ...editHourVals, hours: e.target.value })} style={{ width: 90 }} />
                <button onClick={() => saveHour(h)} style={btnSm(C.teal)}>Save</button>
                <button onClick={() => setEditHourId(null)} style={{ fontSize: 12, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Cancel</button>
              </Row>
            ) : (
              <Row key={h.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontWeight: 600, color: C.ink }}>{nameOf(crew, h.tech_id)}</span>
                <span style={{ color: C.slate }}>{fmtDate(h.work_date)}</span>
                <span style={{ fontWeight: 700, color: h.clocked ? C.orange : C.teal }}>{h.hours} hrs</span>
                {skiChip(h.ski_id)}
                <span style={{ flex: 1, color: C.slate }}>{h.note}</span>
                {isMgr && <button onClick={() => startEditHour(h)} style={{ fontSize: 12, color: C.teal }}>edit</button>}
                <button onClick={async () => { setHours(hours.filter((x) => x.id !== h.id)); await supabase.from("hour_entries").delete().eq("id", h.id); }} style={{ fontSize: 12, color: C.red }}>remove</button>
              </Row>
            )
          ))}
        </div>
      )}
      <Row>
        <Select value={hourForm.tech_id} onChange={(e) => setHourForm({ ...hourForm, tech_id: e.target.value })} style={{ width: "auto" }}>
          {crew.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
        </Select>
        <TextInput type="date" value={hourForm.work_date} onChange={(e) => setHourForm({ ...hourForm, work_date: e.target.value })} style={{ width: "auto" }} />
        <TextInput type="number" step="0.25" min="0" placeholder="1.5" value={hourForm.hours} onChange={(e) => setHourForm({ ...hourForm, hours: e.target.value })} style={{ width: 80 }} />
        <TextInput placeholder="Note" value={hourForm.note} onChange={(e) => setHourForm({ ...hourForm, note: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
        {multiSki && <SkiPick value={hourForm.ski_id} onChange={(v) => setHourForm({ ...hourForm, ski_id: v })} />}
        <button onClick={addHours} style={btn(C.teal)}>Log hours</button>
      </Row>

      <SectionTitle>Parts requests</SectionTitle>
      {requests.length > 0 && (
        <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 8, border: `1px solid ${C.line}` }}>
          {requests.map((p) => (
            editPartId === p.id ? (
              <div key={p.id} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.line}`, fontFamily: BODY, background: "#F6F8F9" }}>
                <Row style={{ flexWrap: "wrap", gap: 8 }}>
                  <TextInput placeholder="Part name" value={editPartVals.name} onChange={(e) => setEditPartVals({ ...editPartVals, name: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
                  <TextInput type="number" min="1" value={editPartVals.qty} onChange={(e) => setEditPartVals({ ...editPartVals, qty: e.target.value })} style={{ width: 70 }} />
                  <TextInput placeholder="SKU" value={editPartVals.sku} onChange={(e) => setEditPartVals({ ...editPartVals, sku: e.target.value })} style={{ width: 110 }} />
                  <TextInput placeholder="Note / supplier" value={editPartVals.note} onChange={(e) => setEditPartVals({ ...editPartVals, note: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                  {isMgr && <TextInput type="number" step="0.01" min="0" placeholder="$ cost" value={editPartVals.cost} onChange={(e) => setEditPartVals({ ...editPartVals, cost: e.target.value })} style={{ width: 90 }} />}
                  {multiSki && <SkiPick value={editPartVals.ski_id} onChange={(v) => setEditPartVals({ ...editPartVals, ski_id: v })} />}
                  {isMgr && (
                    <Select value={editPartVals.status} onChange={(e) => setEditPartVals({ ...editPartVals, status: e.target.value })} style={{ width: "auto" }}>
                      {PART_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                    </Select>
                  )}
                  {isMgr && editPartVals.status === "ordered" && (
                    <TextInput type="date" value={editPartVals.eta} onChange={(e) => setEditPartVals({ ...editPartVals, eta: e.target.value })} style={{ width: "auto" }} />
                  )}
                </Row>
                <Row style={{ marginTop: 8 }}>
                  <button onClick={() => saveEditPart(p)} style={btnSm(C.teal)}>Save</button>
                  <button onClick={() => setEditPartId(null)} style={{ fontSize: 12, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Cancel</button>
                </Row>
              </div>
            ) : (
              <Row key={p.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontWeight: 600, color: C.ink }}>{p.qty}× {p.name}</span>
                {p.sku && <span style={{ fontSize: 12, color: C.slate }}>SKU {p.sku}</span>}
                {skiChip(p.ski_id)}
                <span style={{ flex: 1, color: C.slate }}>{p.note}</span>
                <button onClick={() => cyclePart(p)} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999, background: PART_COLORS[p.status] + "1A", color: PART_COLORS[p.status] }}>{p.status}</button>
                {p.status === "ordered" && (
                  <Row style={{ gap: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.orange, fontFamily: BODY }}>ETA</span>
                    <TextInput type="date" value={p.eta || ""} onChange={(e) => setPartEta(p, e.target.value)} style={{ width: "auto" }} />
                  </Row>
                )}
                <button onClick={() => receivePart(p)} style={btnSm(C.green)}>✓ Received</button>
                {isMgr && p.cost != null && <span style={{ fontWeight: 700, color: C.ink, fontFamily: BODY }}>{money(Number(p.cost) * Number(p.qty))}</span>}
                <button onClick={() => startEditPart(p)} style={{ fontSize: 12, color: C.teal }}>edit</button>
                <button onClick={async () => { setParts(parts.filter((x) => x.id !== p.id)); await supabase.from("parts").delete().eq("id", p.id); }} style={{ fontSize: 12, color: C.red }}>remove</button>
              </Row>
            )
          ))}
        </div>
      )}
      <Row>
        <TextInput placeholder="Part — Starter relay 278003012" value={partForm.name} onChange={(e) => setPartForm({ ...partForm, name: e.target.value })} style={{ flex: 2, minWidth: 180 }} />
        <TextInput type="number" min="1" value={partForm.qty} onChange={(e) => setPartForm({ ...partForm, qty: e.target.value })} style={{ width: 70 }} />
        <TextInput placeholder="SKU" value={partForm.sku} onChange={(e) => setPartForm({ ...partForm, sku: e.target.value })} style={{ width: 100 }} />
        <TextInput placeholder="Note / supplier" value={partForm.note} onChange={(e) => setPartForm({ ...partForm, note: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        {isMgr && <TextInput type="number" step="0.01" min="0" placeholder="$ cost" value={partForm.cost} onChange={(e) => setPartForm({ ...partForm, cost: e.target.value })} style={{ width: 90 }} />}
        {multiSki && <SkiPick value={partForm.ski_id} onChange={(v) => setPartForm({ ...partForm, ski_id: v })} />}
        <button onClick={addPart} style={btn(C.teal)}>Request part</button>
      </Row>

      <SectionTitle>Parts taken</SectionTitle>
      {taken.length > 0 && (
        <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 8, border: `1px solid ${C.line}` }}>
          {taken.map((p) => (
            editPartId === p.id ? (
              <div key={p.id} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.line}`, fontFamily: BODY, background: "#F6F8F9" }}>
                <Row style={{ flexWrap: "wrap", gap: 8 }}>
                  <TextInput placeholder="Part name" value={editPartVals.name} onChange={(e) => setEditPartVals({ ...editPartVals, name: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
                  <TextInput type="number" min="1" value={editPartVals.qty} onChange={(e) => setEditPartVals({ ...editPartVals, qty: e.target.value })} style={{ width: 70 }} />
                  <TextInput placeholder="SKU" value={editPartVals.sku} onChange={(e) => setEditPartVals({ ...editPartVals, sku: e.target.value })} style={{ width: 110 }} />
                  <TextInput placeholder="Note" value={editPartVals.note} onChange={(e) => setEditPartVals({ ...editPartVals, note: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                  {isMgr && <TextInput type="number" step="0.01" min="0" placeholder="$ cost" value={editPartVals.cost} onChange={(e) => setEditPartVals({ ...editPartVals, cost: e.target.value })} style={{ width: 90 }} />}
                  <TextInput type="number" step="0.01" min="0" placeholder="$ price" value={editPartVals.price} onChange={(e) => setEditPartVals({ ...editPartVals, price: e.target.value })} style={{ width: 90 }} />
                  <Select value={editPartVals.warranty} onChange={(e) => setEditPartVals({ ...editPartVals, warranty: e.target.value })} style={{ width: "auto" }}>
                    <option value="">Warr —</option>
                    <option value="Y">Warr Y</option>
                    <option value="N">Warr N</option>
                  </Select>
                  {multiSki && <SkiPick value={editPartVals.ski_id} onChange={(v) => setEditPartVals({ ...editPartVals, ski_id: v })} />}
                </Row>
                <Row style={{ marginTop: 8 }}>
                  <button onClick={() => saveEditPart(p)} style={btnSm(C.teal)}>Save</button>
                  <button onClick={() => setEditPartId(null)} style={{ fontSize: 12, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Cancel</button>
                </Row>
              </div>
            ) : (
              <Row key={p.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontWeight: 600, color: C.ink }}>{p.qty}× {p.name}</span>
                {p.sku && <span style={{ fontSize: 12, color: C.slate }}>SKU {p.sku}</span>}
                {skiChip(p.ski_id)}
                <span style={{ flex: 1, color: C.slate }}>{p.note}</span>
                <span style={{ fontSize: 12, color: C.slate }}>{fmtDate(p.created_at)}</span>
                {isMgr && p.cost != null && <span style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>cost {money(Number(p.cost) * Number(p.qty))}</span>}
                {p.price != null && <span style={{ fontWeight: 700, color: C.teal, fontFamily: BODY }}>{money(Number(p.price) * Number(p.qty))}</span>}
                <button onClick={() => startEditPart(p)} style={{ fontSize: 12, color: C.teal }}>edit</button>
                <button onClick={async () => { setParts(parts.filter((x) => x.id !== p.id)); await supabase.from("parts").delete().eq("id", p.id); }} style={{ fontSize: 12, color: C.red }}>remove</button>
              </Row>
            )
          ))}
        </div>
      )}
      <Row>
        <TextInput placeholder="Part pulled — e.g. impeller, oil filter" value={takenForm.name} onChange={(e) => setTakenForm({ ...takenForm, name: e.target.value })} style={{ flex: 2, minWidth: 180 }} />
        <TextInput type="number" min="1" value={takenForm.qty} onChange={(e) => setTakenForm({ ...takenForm, qty: e.target.value })} style={{ width: 70 }} />
        <TextInput placeholder="SKU" value={takenForm.sku} onChange={(e) => setTakenForm({ ...takenForm, sku: e.target.value })} style={{ width: 100 }} />
        <TextInput placeholder="Note" value={takenForm.note} onChange={(e) => setTakenForm({ ...takenForm, note: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        {isMgr && <TextInput type="number" step="0.01" min="0" placeholder="$ cost" value={takenForm.cost} onChange={(e) => setTakenForm({ ...takenForm, cost: e.target.value })} style={{ width: 90 }} />}
        {multiSki && <SkiPick value={takenForm.ski_id} onChange={(v) => setTakenForm({ ...takenForm, ski_id: v })} />}
        <button onClick={addTaken} style={btn("#fff", C.ink)}>Log part taken</button>
      </Row>

      {isMgr && (
        <>
          <SectionTitle>Scheduling</SectionTitle>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, background: "#F6F8F9" }}>
            <Row style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div><Label>Scheduled date</Label><TextInput type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} onBlur={() => patchOrder({ scheduled_date: schedDate || null })} style={{ width: "auto" }} /></div>
              <div><Label>Estimated repair time (hrs)</Label><TextInput type="number" step="0.5" min="0" placeholder="—" value={estHours} onChange={(e) => setEstHours(e.target.value)} onBlur={() => patchOrder({ est_hours: estHours === "" ? null : Number(estHours) })} style={{ width: 130 }} /></div>
            </Row>
            <div style={{ fontSize: 11, color: C.slate, fontFamily: BODY, marginTop: 8 }}>Feeds the Planner — schedule, price list and revenue projections.</div>
          </div>
        </>
      )}

      {isMgr && (
        <>
          <SectionTitle>Cost & profit</SectionTitle>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, background: "#F6F8F9" }}>
            <Row style={{ gap: 12, flexWrap: "wrap" }}>
              {quotes.length ? (
                <div><Label>Revenue (invoiced)</Label><div style={{ fontFamily: BODY, fontSize: 15, fontWeight: 700, color: C.ink, padding: "6px 0", whiteSpace: "nowrap" }}>{money(invoicedTotal)} <span style={{ fontSize: 11, fontWeight: 600, color: C.slate }}>from {quotes.length} invoice{quotes.length > 1 ? "s" : ""}</span></div></div>
              ) : (
                <div><Label>Repair total ($)</Label><TextInput type="number" step="0.01" min="0" placeholder="0.00" value={repairTotal} onChange={(e) => setRepairTotal(e.target.value)} onBlur={saveRepairTotal} style={{ width: 130 }} /></div>
              )}
              <div><Label>Down payment ($)</Label><TextInput type="number" step="0.01" min="0" placeholder="0.00" value={deposit} onChange={(e) => setDeposit(e.target.value)} onBlur={saveDeposit} style={{ width: 130 }} /></div>
              <div><Label>Shop rate ($/hr)</Label><TextInput type="number" step="1" min="0" placeholder={shopRateGlobal ? String(shopRateGlobal) : "0"} value={shopRateInput} onChange={(e) => setShopRateInput(e.target.value)} onBlur={saveShopRateOverride} style={{ width: 130 }} /></div>
            </Row>
            <div style={{ fontSize: 11, color: C.slate, fontFamily: BODY, marginTop: 4 }}>Shop rate blank = shop default ({money(shopRateGlobal)}/hr). Enter a value to override it for this order.</div>
            <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
              {laborRows.map((r) => (
                <Row key={r.id} style={{ justifyContent: "space-between", fontSize: 13, fontFamily: BODY, color: C.slate, marginBottom: 2 }}>
                  <span>{r.name} — {r.hrs} hrs @ {money(r.rate)}/hr</span>
                  <span>{money(r.cost)}</span>
                </Row>
              ))}
              <CostLine label="Parts cost" value={money(partsCost)} />
              <CostLine label="Labor cost" value={money(laborCost)} />
              <CostLine label="Total cost" value={money(totalCost)} bold />
              <CostLine label={quotes.length ? "Revenue (invoiced)" : "Repair total"} value={money(revenue)} />
              <CostLine label="Profit" value={money(profit)} color={profit >= 0 ? C.green : C.red} bold />
              <div style={{ borderTop: `1px dashed ${C.line}`, marginTop: 8, paddingTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: C.slate, fontFamily: BODY, marginBottom: 2 }}>Price to charge customer</div>
                <CostLine label="Parts (customer price)" value={money(partsPriceCustomer)} />
                <CostLine label={`Labor — ${totalHrs} hrs @ ${money(shopRate)}/hr`} value={money(laborCharge)} />
                <CostLine label="Suggested price to charge" value={money(suggestedCharge)} color={C.teal} bold />
              </div>
              <div style={{ borderTop: `1px dashed ${C.line}`, marginTop: 8, paddingTop: 8 }}>
                <CostLine label="Down payment" value={money(depositNum)} />
                <CostLine label="Balance due" value={money(order.paid_in_full ? 0 : balanceDue)} color={order.paid_in_full || balanceDue <= 0 ? C.green : C.orange} bold />
              </div>
            </div>
            <Row style={{ marginTop: 12, gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {order.paid_in_full ? (
                <>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 12px", borderRadius: 999, background: C.green + "1A", color: C.green }}>✓ Paid in full{order.paid_at ? ` · ${fmtDate(order.paid_at)}` : ""}</span>
                  <button onClick={unmarkPaid} style={{ fontSize: 12, fontWeight: 600, color: C.slate, fontFamily: BODY }}>undo</button>
                </>
              ) : (
                <>
                  <button onClick={requestPayment} disabled={payBusy} style={{ ...btn(C.teal), opacity: payBusy ? 0.6 : 1 }}>{payBusy ? "Creating link…" : "Request payment"}</button>
                  <button onClick={markPaidInFull} style={btn(C.green)}>Mark paid in full</button>
                </>
              )}
            </Row>
            {payErr && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY, marginTop: 6 }}>{payErr}</div>}
            {payLink && (
              <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 6, wordBreak: "break-all" }}>
                Payment link: <a href={payLink} target="_blank" rel="noreferrer" style={{ color: C.teal, fontWeight: 600 }}>{payLink}</a>
                {!order.customer_phone && " — add a customer phone to text it automatically."}
              </div>
            )}
            <div style={{ fontSize: 11, color: C.slate, fontFamily: BODY, marginTop: 8 }}>Labor cost uses each tech's pay rate (set in Crew). Parts cost sums the unit cost entered on parts. Revenue is the sum of all invoices on this order (or the typed repair total if there are none yet). Profit = revenue − parts − labor.</div>
            <Row style={{ marginTop: 10 }}>
              <button onClick={exportCostProfit} disabled={xlsxBusy} style={{ ...btnSm("#fff", C.ink), opacity: xlsxBusy ? 0.6 : 1 }}>{xlsxBusy ? "Building…" : "⬇ Export to Excel"}</button>
            </Row>
          </div>
        </>
      )}

      <SectionTitle>Photos & video</SectionTitle>
      {multiSki && (
        <Row style={{ marginBottom: 10, alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.slate, fontFamily: BODY }}>For ski</span>
          <SkiPick value={mediaSki} onChange={setMediaSki} />
        </Row>
      )}
      <label style={{ ...btn(C.orange), display: "inline-block", marginBottom: 10, cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.6 : 1 }}>
        {uploading ? "Uploading…" : "+ Add photos / video"}
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={uploadFiles} />
      </label>
      {media.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No media yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
          {media.map((m) => (
            <div key={m.id} style={{ position: "relative" }}>
              <div onClick={() => setLightbox(m)} style={{ height: 96, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}`, background: C.ink, cursor: "pointer" }}>
                {m.kind === "video"
                  ? <video src={publicUrl(m.path)} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <img src={publicUrl(m.path)} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <button onClick={() => removeMedia(m)} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 999, fontSize: 11, color: "#fff", background: C.red }}>✕</button>
              {skiName(m.ski_id) && <div style={{ position: "absolute", bottom: 4, left: 4, right: 4, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "#fff", background: "rgba(8,20,30,0.7)", borderRadius: 4, padding: "1px 4px", textAlign: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{skiName(m.ski_id)}</div>}
            </div>
          ))}
        </div>
      )}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(8,20,30,0.88)" }}>
          {lightbox.kind === "video"
            ? <video src={publicUrl(lightbox.path)} controls autoPlay onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
            : <img src={publicUrl(lightbox.path)} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />}
        </div>
      )}

      {order.kind !== "maintenance" && (
        <RepairOrder
          orderId={orderId}
          taken={taken}
          patchPartLocal={patchPartLocal}
          commitPart={commitPart}
          updatePart={updatePart}
          addTakenPart={addTakenPart}
          deletePart={deletePart}
          totalHrs={totalHrs}
          shopRate={shopRate}
          laborCharge={laborCharge}
          money={money}
        />
      )}
    </>
  );
}

/* ================= LAKE TAB ================= */
function LakeTab({ orderId, crew, profile, lakeTests, setLakeTests, lakeSession, setLakeSession }) {
  const [tech, setTech] = useState(profile.id);
  const [manual, setManual] = useState({ tech_id: profile.id, minutes: "", note: "" });

  async function startTest() {
    const { data, error } = await supabase.from("lake_sessions").insert({ order_id: orderId, tech_id: tech }).select().single();
    if (!error) setLakeSession(data);
  }
  async function stopTest() {
    const seconds = Math.round((Date.now() - new Date(lakeSession.started_at).getTime()) / 1000);
    const { data } = await supabase.from("lake_tests").insert({ order_id: orderId, tech_id: lakeSession.tech_id, seconds }).select().single();
    await supabase.from("lake_sessions").delete().eq("order_id", orderId);
    setLakeSession(null);
    if (data) setLakeTests([...lakeTests, data]);
  }
  async function addManual() {
    const min = Number(manual.minutes);
    if (!min || min <= 0) return;
    const { data } = await supabase.from("lake_tests").insert({ order_id: orderId, tech_id: manual.tech_id, seconds: min * 60, note: manual.note.trim() }).select().single();
    if (data) { setLakeTests([...lakeTests, data]); setManual({ ...manual, minutes: "", note: "" }); }
  }
  async function patchRun(id, patch) {
    setLakeTests(lakeTests.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    await supabase.from("lake_tests").update(patch).eq("id", id);
  }
  const totalHrs = round2((lakeTests.reduce((s, r) => s + r.seconds, 0) + (lakeSession ? (Date.now() - new Date(lakeSession.started_at).getTime()) / 1000 : 0)) / 3600);

  return (
    <>
      <SectionTitle right={<span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: BODY }}>{totalHrs} hrs on the water</span>}>Lake test timer</SectionTitle>
      <div style={{ borderRadius: 6, padding: 12, background: C.water }}>
        {lakeSession ? (
          <Row>
            <LiveDot color="#38BDF8" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: BODY }}>{nameOf(crew, lakeSession.tech_id)} is on the water</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>{fmtElapsed(Date.now() - new Date(lakeSession.started_at).getTime())}</span>
            <button onClick={stopTest} style={{ ...btnSm(C.orange), marginLeft: "auto" }}>■ End test run</button>
          </Row>
        ) : (
          <Row>
            <Select value={tech} onChange={(e) => setTech(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
              {crew.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
            </Select>
            <button onClick={startTest} style={btn("#fff", C.water)}>▶ Start test run</button>
          </Row>
        )}
      </div>

      <SectionTitle>Test runs</SectionTitle>
      {lakeTests.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No test runs yet.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 8, border: `1px solid ${C.line}` }}>
          {lakeTests.map((r) => (
            <Row key={r.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ fontWeight: 600, color: C.ink }}>{nameOf(crew, r.tech_id)}</span>
              <span style={{ color: C.slate }}>{fmtDate(r.test_date)}</span>
              <span style={{ fontWeight: 700, color: C.teal }}>{fmtElapsed(r.seconds * 1000)}</span>
              <button onClick={() => patchRun(r.id, { result: TEST_RESULTS[(TEST_RESULTS.indexOf(r.result) + 1) % TEST_RESULTS.length] })}
                style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: TEST_COLORS[r.result] + "1A", color: TEST_COLORS[r.result] }}>
                {r.result}
              </button>
              <RunNote value={r.note} onSave={(note) => patchRun(r.id, { note })} />
              <button onClick={async () => { setLakeTests(lakeTests.filter((x) => x.id !== r.id)); await supabase.from("lake_tests").delete().eq("id", r.id); }} style={{ fontSize: 12, color: C.red }}>remove</button>
            </Row>
          ))}
        </div>
      )}
      <Row>
        <Select value={manual.tech_id} onChange={(e) => setManual({ ...manual, tech_id: e.target.value })} style={{ width: "auto" }}>
          {crew.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
        </Select>
        <TextInput type="number" min="1" placeholder="Minutes" value={manual.minutes} onChange={(e) => setManual({ ...manual, minutes: e.target.value })} style={{ width: 100 }} />
        <TextInput placeholder="Note" value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
        <button onClick={addManual} style={btn(C.teal)}>Add run</button>
      </Row>
    </>
  );
}

function CostLine({ label, value, bold, color }) {
  return (
    <Row style={{ justifyContent: "space-between", fontSize: 14, fontFamily: BODY, marginTop: 3 }}>
      <span style={{ color: C.slate, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ color: color || C.ink, fontWeight: bold ? 700 : 600 }}>{value}</span>
    </Row>
  );
}

function RunNote({ value, onSave }) {
  const [v, setV] = useState(value || "");
  return <TextInput value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value || "") && onSave(v)} placeholder="Notes — cavitation gone, 52 mph…" style={{ flex: 1, minWidth: 160 }} />;
}
