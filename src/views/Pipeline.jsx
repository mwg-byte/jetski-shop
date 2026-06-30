import { useState, useEffect, useMemo } from "react";
import { supabase, C, DISPLAY, BODY, today, round2, fmtDate, stageOf } from "../lib/supabase";
import { Card, Row, TextInput, Select, StatusChip, btn } from "../lib/ui";

const money = (n) => "$" + (Number(n) || 0).toFixed(2);
const skiText = (o) => [o.year, o.make, o.model].filter(Boolean).join(" ");
const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");
const m2 = (n) => round2(Number(n) || 0);

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
function weekStartISO(iso) {
  const d = new Date(iso + "T12:00:00");
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
function weekLabel(iso) {
  const start = new Date(iso + "T12:00:00");
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return `${fmtDate(start.toISOString())} – ${fmtDate(end.toISOString())}`;
}

const SUBTABS = [
  { key: "price", label: "By price" },
  { key: "schedule", label: "Schedule" },
  { key: "revenue", label: "Revenue" },
  { key: "paid", label: "Paid" },
];

export default function Pipeline({ orders = [], crew = [], onOpen, onBack }) {
  const [tab, setTab] = useState("price");
  const [rows, setRows] = useState([]);          // work orders (local, editable)
  const [parts, setParts] = useState([]);
  const [hours, setHours] = useState([]);
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // seed from the orders App already loaded, then refresh costs data
  useEffect(() => { setRows(orders.filter((o) => o.kind !== "maintenance")); }, [orders]);

  useEffect(() => {
    (async () => {
      const [w, p, h, pr] = await Promise.all([
        supabase.from("work_orders").select("*"),
        supabase.from("parts").select("order_id, cost, qty"),
        supabase.from("hour_entries").select("order_id, tech_id, hours"),
        supabase.from("pay_rates").select("tech_id, hourly_rate"),
      ]);
      setRows((w.data || []).filter((o) => o.kind !== "maintenance"));
      setParts(p.data || []);
      setHours(h.data || []);
      const rmap = {}; (pr.data || []).forEach((r) => { rmap[r.tech_id] = Number(r.hourly_rate) || 0; });
      setRates(rmap);
      setLoading(false);
    })();
  }, []);

  // per-order cost / profit — same structure as the work-order Cost & profit block
  const calc = useMemo(() => {
    const partsByOrder = {}, laborByOrder = {};
    parts.forEach((p) => { partsByOrder[p.order_id] = (partsByOrder[p.order_id] || 0) + (Number(p.cost) || 0) * (Number(p.qty) || 1); });
    hours.forEach((h) => { laborByOrder[h.order_id] = (laborByOrder[h.order_id] || 0) + Number(h.hours) * (rates[h.tech_id] || 0); });
    const map = {};
    rows.forEach((o) => {
      const partsCost = round2(partsByOrder[o.id] || 0);
      const laborCost = round2(laborByOrder[o.id] || 0);
      const totalCost = round2(partsCost + laborCost);
      const repairTotal = Number(o.repair_total) || 0;
      map[o.id] = { partsCost, laborCost, totalCost, repairTotal, profit: round2(repairTotal - totalCost) };
    });
    return map;
  }, [rows, parts, hours, rates]);

  async function updateOrder(id, patch) {
    setRows((rs) => rs.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    await supabase.from("work_orders").update(patch).eq("id", id);
  }

  async function exportExcel() {
    setBusy(true); setErr("");
    try {
      const XLSX = await loadXLSX();
      const statusOf = (o) => stageOf(o.status).label;

      // ---- Summary ----
      const totRepair = m2(rows.reduce((a, o) => a + (calc[o.id]?.repairTotal || 0), 0));
      const totCost = m2(rows.reduce((a, o) => a + (calc[o.id]?.totalCost || 0), 0));
      const totProfit = m2(totRepair - totCost);
      const collected = m2(rows.filter((o) => o.paid_in_full).reduce((a, o) => a + (Number(o.paid_amount) || calc[o.id]?.repairTotal || 0), 0));
      const deposits = m2(rows.filter((o) => !o.paid_in_full && Number(o.deposit_amount) > 0).reduce((a, o) => a + Number(o.deposit_amount), 0));
      const sumAoa = [
        ["Jet Ski Shop — Cost & profit"],
        ["Generated", new Date().toLocaleString()],
        [],
        ["Jobs (excludes maintenance)", rows.length],
        ["Total repair $", totRepair],
        ["Total est. cost", totCost],
        ["Total est. profit", totProfit],
        ["Collected (paid in full)", collected],
        ["Deposits held (not yet paid in full)", deposits],
        [],
        ["Est. cost = logged parts cost + logged labor (tech pay rate). Profit = repair total − est. cost."],
      ];

      // ---- By customer (a row per job, grouped + per-customer totals) ----
      const custHdr = ["Customer", "Ski", "Status", "Intake", "Scheduled", "Paid on", "Repair total", "Parts cost", "Labor cost", "Total cost", "Profit", "Paid in full?"];
      const custAoa = [custHdr];
      const byCust = {};
      rows.forEach((o) => { const k = o.customer_name || "—"; (byCust[k] = byCust[k] || []).push(o); });
      let gR = 0, gP = 0, gL = 0, gC = 0, gPr = 0;
      Object.keys(byCust).sort((a, b) => a.localeCompare(b)).forEach((name) => {
        const list = byCust[name].slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        let sR = 0, sP = 0, sL = 0, sC = 0, sPr = 0;
        list.forEach((o) => {
          const c = calc[o.id] || {};
          custAoa.push([
            name, skiText(o), statusOf(o),
            o.created_at ? fmtDate(o.created_at) : "",
            o.scheduled_date ? fmtDate(o.scheduled_date) : "",
            o.paid_at ? fmtDate(o.paid_at) : "",
            m2(c.repairTotal), m2(c.partsCost), m2(c.laborCost), m2(c.totalCost), m2(c.profit),
            o.paid_in_full ? "Yes" : "",
          ]);
          sR += c.repairTotal || 0; sP += c.partsCost || 0; sL += c.laborCost || 0; sC += c.totalCost || 0; sPr += c.profit || 0;
        });
        if (list.length > 1) custAoa.push([`Total — ${name}`, "", "", "", "", "", m2(sR), m2(sP), m2(sL), m2(sC), m2(sPr), ""]);
        gR += sR; gP += sP; gL += sL; gC += sC; gPr += sPr;
      });
      custAoa.push([]);
      custAoa.push(["GRAND TOTAL", "", "", "", "", "", m2(gR), m2(gP), m2(gL), m2(gC), m2(gPr), ""]);

      // ---- By week (paid date) ----
      const weekHdr = ["Week of", "Customer", "Ski", "Paid on", "Repair total", "Parts cost", "Labor cost", "Total cost", "Profit"];
      const weekAoa = [weekHdr];
      const paidRows = rows.filter((o) => o.paid_in_full && o.paid_at);
      if (!paidRows.length) {
        weekAoa.push(["No jobs marked paid in full yet."]);
      } else {
        const byWeek = {};
        paidRows.forEach((o) => { const k = weekStartISO(dateOnly(o.paid_at)); (byWeek[k] = byWeek[k] || []).push(o); });
        let wgR = 0, wgP = 0, wgL = 0, wgC = 0, wgPr = 0;
        Object.keys(byWeek).sort().forEach((k) => {
          const list = byWeek[k].slice().sort((a, b) => dateOnly(a.paid_at).localeCompare(dateOnly(b.paid_at)));
          let sR = 0, sP = 0, sL = 0, sC = 0, sPr = 0;
          list.forEach((o, idx) => {
            const c = calc[o.id] || {};
            weekAoa.push([
              idx === 0 ? weekLabel(k) : "", o.customer_name || "—", skiText(o), fmtDate(o.paid_at),
              m2(c.repairTotal), m2(c.partsCost), m2(c.laborCost), m2(c.totalCost), m2(c.profit),
            ]);
            sR += c.repairTotal || 0; sP += c.partsCost || 0; sL += c.laborCost || 0; sC += c.totalCost || 0; sPr += c.profit || 0;
          });
          weekAoa.push(["", "Week total", "", "", m2(sR), m2(sP), m2(sL), m2(sC), m2(sPr)]);
          weekAoa.push([]);
          wgR += sR; wgP += sP; wgL += sL; wgC += sC; wgPr += sPr;
        });
        weekAoa.push(["GRAND TOTAL", "", "", "", m2(wgR), m2(wgP), m2(wgL), m2(wgC), m2(wgPr)]);
      }

      const wb = XLSX.utils.book_new();
      const mk = (name, aoa, cols) => { const ws = XLSX.utils.aoa_to_sheet(aoa); if (cols) ws["!cols"] = cols.map((w) => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
      mk("Summary", sumAoa, [34, 22]);
      mk("By customer", custAoa, [20, 20, 14, 12, 12, 12, 12, 11, 11, 11, 11, 12]);
      mk("By week", weekAoa, [22, 20, 20, 12, 12, 11, 11, 11, 11]);
      XLSX.writeFile(wb, `jetski-cost-profit-${today()}.xlsx`);
    } catch (e) {
      setErr(e.message || "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Planner</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Organize jobs by repair price and estimated profit, schedule them by date, project revenue for a date range, and review the skis you've been paid on.
      </p>

      <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 14, flexWrap: "wrap" }}>
        {SUBTABS.map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em",
              padding: "8px 14px", borderRadius: 999, whiteSpace: "nowrap",
              background: active ? C.ink : "#F1F4F6", color: active ? "#fff" : C.slate,
            }}>{t.label}</button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Loading shop data…</div>
      ) : tab === "price" ? (
        <PriceList rows={rows} calc={calc} onOpen={onOpen} updateOrder={updateOrder} />
      ) : tab === "schedule" ? (
        <ScheduleView rows={rows} calc={calc} onOpen={onOpen} updateOrder={updateOrder} />
      ) : tab === "revenue" ? (
        <RevenueView rows={rows} calc={calc} />
      ) : (
        <PaidView rows={rows} calc={calc} onOpen={onOpen} />
      )}
    </Card>
  );
}

/* ---------- shared bits ---------- */
const th = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.slate, fontFamily: BODY, padding: "8px 10px", background: "#F6F8F9", textAlign: "left" };
const td = { fontSize: 14, fontFamily: BODY, color: C.ink, padding: "8px 10px", borderTop: `1px solid ${C.line}`, verticalAlign: "middle" };
const profitColor = (n) => (n > 0 ? C.green : n < 0 ? C.red : C.slate);

function OrderCell({ o, onOpen }) {
  return (
    <button onClick={() => onOpen(o.id)} style={{ textAlign: "left", fontFamily: BODY }}>
      <div style={{ fontWeight: 700, color: C.ink, fontFamily: DISPLAY, fontSize: 18 }}>{o.customer_name}</div>
      <div style={{ fontSize: 12, color: C.slate }}>{skiText(o) || "—"}</div>
    </button>
  );
}

/* ---------- 1. By price ---------- */
function PriceList({ rows, calc, onOpen, updateOrder }) {
  const sorted = [...rows].sort((a, b) => (calc[b.id]?.repairTotal || 0) - (calc[a.id]?.repairTotal || 0));
  const totRepair = round2(sorted.reduce((a, o) => a + (calc[o.id]?.repairTotal || 0), 0));
  const totProfit = round2(sorted.reduce((a, o) => a + (calc[o.id]?.profit || 0), 0));

  if (!sorted.length) return <Empty>No repair orders yet.</Empty>;
  return (
    <>
      <SummaryStrip items={[["Jobs", sorted.length], ["Total repair $", money(totRepair)], ["Est. profit", money(totProfit), profitColor(totProfit)]]} />
      <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>Job</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: "right" }}>Repair total</th>
              <th style={{ ...th, textAlign: "right" }}>Est. cost</th>
              <th style={{ ...th, textAlign: "right" }}>Est. profit</th>
              <th style={th}>Scheduled</th>
              <th style={{ ...th, textAlign: "right" }}>Est. hrs</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => {
              const c = calc[o.id] || {};
              return (
                <tr key={o.id}>
                  <td style={td}><OrderCell o={o} onOpen={onOpen} /></td>
                  <td style={td}><StatusChip status={o.status} /></td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{money(c.repairTotal)}</td>
                  <td style={{ ...td, textAlign: "right", color: C.slate }}>{money(c.totalCost)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: profitColor(c.profit) }}>{money(c.profit)}</td>
                  <td style={td}>
                    <TextInput type="date" value={dateOnly(o.scheduled_date)} onChange={(e) => updateOrder(o.id, { scheduled_date: e.target.value || null })} style={{ width: "auto", padding: "6px 8px" }} />
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <TextInput type="number" step="0.5" min="0" placeholder="—" value={o.est_hours ?? ""} onChange={(e) => updateOrder(o.id, { est_hours: e.target.value === "" ? null : Number(e.target.value) })} style={{ width: 70, padding: "6px 8px", textAlign: "right" }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Note>Est. cost = logged parts cost + logged labor (each tech's pay rate). Est. profit = repair total − est. cost — the same math as each order's Cost &amp; profit panel. Set a repair total on the order to see profit.</Note>
    </>
  );
}

/* ---------- 2. Schedule ---------- */
function ScheduleView({ rows, calc, onOpen, updateOrder }) {
  const scheduled = rows.filter((o) => o.scheduled_date && o.status !== "closed");
  const unscheduled = rows.filter((o) => !o.scheduled_date && o.status !== "closed");

  const byDate = {};
  scheduled.forEach((o) => { (byDate[dateOnly(o.scheduled_date)] = byDate[dateOnly(o.scheduled_date)] || []).push(o); });
  const days = Object.keys(byDate).sort();

  return (
    <>
      <SummaryStrip items={[
        ["Scheduled", scheduled.length],
        ["Unscheduled", unscheduled.length],
        ["Est. hrs booked", round2(scheduled.reduce((a, o) => a + (Number(o.est_hours) || 0), 0))],
      ]} />

      {days.length === 0 ? <Empty>Nothing scheduled yet. Set a date on a job below or in the “By price” tab.</Empty> : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14 }}>
          {days.map((d) => {
            const list = byDate[d];
            const hrs = round2(list.reduce((a, o) => a + (Number(o.est_hours) || 0), 0));
            const rev = round2(list.reduce((a, o) => a + (calc[o.id]?.repairTotal || 0), 0));
            return (
              <div key={d} style={{ borderRadius: 8, border: `1px solid ${C.line}`, overflow: "hidden" }}>
                <Row style={{ justifyContent: "space-between", padding: "8px 12px", background: C.ink }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, color: "#fff", textTransform: "uppercase" }}>{fmtDate(d)}</span>
                  <span style={{ fontSize: 12, color: "#CFE0EA", fontFamily: BODY }}>{list.length} job{list.length > 1 ? "s" : ""} · {hrs} est. hrs · {money(rev)}</span>
                </Row>
                {list.map((o) => (
                  <Row key={o.id} style={{ justifyContent: "space-between", padding: "8px 12px", borderTop: `1px solid ${C.line}` }}>
                    <OrderCell o={o} onOpen={onOpen} />
                    <Row style={{ gap: 10 }}>
                      <StatusChip status={o.status} />
                      <span style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>{o.est_hours ? `${o.est_hours} hr` : "—"}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: BODY }}>{money(calc[o.id]?.repairTotal)}</span>
                      <TextInput type="date" value={dateOnly(o.scheduled_date)} onChange={(e) => updateOrder(o.id, { scheduled_date: e.target.value || null })} style={{ width: "auto", padding: "6px 8px" }} />
                    </Row>
                  </Row>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <h4 style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 20, marginBottom: 8 }}>Unscheduled jobs</h4>
      {unscheduled.length === 0 ? <Empty>Every open job has a date. Nice.</Empty> : (
        <div style={{ borderRadius: 8, border: `1px solid ${C.line}`, overflow: "hidden" }}>
          {unscheduled.map((o) => (
            <Row key={o.id} style={{ justifyContent: "space-between", padding: "8px 12px", borderTop: `1px solid ${C.line}` }}>
              <OrderCell o={o} onOpen={onOpen} />
              <Row style={{ gap: 10 }}>
                <StatusChip status={o.status} />
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: BODY }}>{money(calc[o.id]?.repairTotal)}</span>
                <TextInput type="date" value="" onChange={(e) => updateOrder(o.id, { scheduled_date: e.target.value || null })} style={{ width: "auto", padding: "6px 8px" }} />
              </Row>
            </Row>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- 3. Revenue by date range ---------- */
const BASES = [
  { key: "scheduled", label: "Scheduled date", field: (o) => dateOnly(o.scheduled_date) },
  { key: "intake", label: "Intake date", field: (o) => dateOnly(o.created_at) },
  { key: "paid", label: "Paid date", field: (o) => (o.paid_in_full ? dateOnly(o.paid_at) : "") },
];
function monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
function monthEnd() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); }

function RevenueView({ rows, calc }) {
  const [basis, setBasis] = useState("paid");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const base = BASES.find((b) => b.key === basis);

  const hits = rows.filter((o) => {
    const d = base.field(o);
    return d && (!from || d >= from) && (!to || d <= to);
  });
  const repair = round2(hits.reduce((a, o) => a + (calc[o.id]?.repairTotal || 0), 0));
  const cost = round2(hits.reduce((a, o) => a + (calc[o.id]?.totalCost || 0), 0));
  const profit = round2(repair - cost);

  async function exportRange() {
    setBusy(true); setErr("");
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.utils.book_new();
      const mk = (name, aoa, cols) => { const ws = XLSX.utils.aoa_to_sheet(aoa); if (cols) ws["!cols"] = cols.map((w) => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
      const sumAoa = [
        ["Jet Ski Shop — Revenue & profit"],
        ["Based on", base.label],
        ["Range", `${fmtDate(from)} – ${fmtDate(to)}`],
        ["Generated", new Date().toLocaleString()],
        [],
        ["Jobs", hits.length],
        ["Revenue (repair total)", repair],
        ["Est. cost", cost],
        ["Est. profit", profit],
      ];
      const hdr = ["Week of", "Customer", "Ski", base.label, "Repair total", "Parts cost", "Labor cost", "Total cost", "Profit"];
      const aoa = [hdr];
      const byWeek = {};
      hits.forEach((o) => { const k = weekStartISO(base.field(o)); (byWeek[k] = byWeek[k] || []).push(o); });
      const g = { r: 0, p: 0, l: 0, c: 0, pr: 0 };
      Object.keys(byWeek).sort().forEach((k) => {
        const list = byWeek[k].slice().sort((a, b) => base.field(a).localeCompare(base.field(b)));
        const s = { r: 0, p: 0, l: 0, c: 0, pr: 0 };
        list.forEach((o, idx) => {
          const c = calc[o.id] || {};
          aoa.push([idx === 0 ? weekLabel(k) : "", o.customer_name || "—", skiText(o), fmtDate(base.field(o)), m2(c.repairTotal), m2(c.partsCost), m2(c.laborCost), m2(c.totalCost), m2(c.profit)]);
          s.r += c.repairTotal || 0; s.p += c.partsCost || 0; s.l += c.laborCost || 0; s.c += c.totalCost || 0; s.pr += c.profit || 0;
        });
        aoa.push(["", "Week total", "", "", m2(s.r), m2(s.p), m2(s.l), m2(s.c), m2(s.pr)]);
        aoa.push([]);
        g.r += s.r; g.p += s.p; g.l += s.l; g.c += s.c; g.pr += s.pr;
      });
      aoa.push(["GRAND TOTAL", "", "", "", m2(g.r), m2(g.p), m2(g.l), m2(g.c), m2(g.pr)]);
      mk("Summary", sumAoa, [26, 24]);
      mk("By week", aoa, [22, 20, 20, 13, 12, 11, 11, 11, 11]);
      XLSX.writeFile(wb, `jetski-revenue-${from}_to_${to}.xlsx`);
    } catch (e) {
      setErr(e.message || "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Row style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: C.slate, fontFamily: BODY, marginBottom: 2 }}>Based on</div>
          <Select value={basis} onChange={(e) => setBasis(e.target.value)} style={{ width: "auto" }}>
            {BASES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </Select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: C.slate, fontFamily: BODY, marginBottom: 2 }}>From</div>
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "auto" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: C.slate, fontFamily: BODY, marginBottom: 2 }}>To</div>
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "auto" }} />
        </div>
        <button onClick={() => { setFrom(monthStart()); setTo(monthEnd()); }} style={{ ...btn("#F1F4F6", C.slate), fontSize: 12, padding: "6px 12px" }}>This month</button>
        <button onClick={exportRange} disabled={busy} style={{ ...btn("#fff", C.ink), fontSize: 12, padding: "6px 12px", opacity: busy ? 0.6 : 1 }}>{busy ? "Building…" : "⬇ Export Excel"}</button>
      </Row>
      {err && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY, marginTop: 6 }}>{err}</div>}

      <SummaryStrip items={[
        ["Jobs", hits.length],
        ["Projected revenue", money(repair)],
        ["Est. cost", money(cost)],
        ["Est. profit", money(profit), profitColor(profit)],
      ]} />

      {hits.length === 0 ? <Empty>No jobs fall in this range. Try a wider range or a different date basis.</Empty> : (
        <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr>
                <th style={th}>Job</th>
                <th style={th}>{base.label}</th>
                <th style={{ ...th, textAlign: "right" }}>Repair total</th>
                <th style={{ ...th, textAlign: "right" }}>Est. profit</th>
              </tr>
            </thead>
            <tbody>
              {hits.sort((a, b) => base.field(a).localeCompare(base.field(b))).map((o) => (
                <tr key={o.id}>
                  <td style={td}>
                    <div style={{ fontWeight: 700, color: C.ink, fontFamily: DISPLAY, fontSize: 17 }}>{o.customer_name}</div>
                    <div style={{ fontSize: 12, color: C.slate }}>{skiText(o) || "—"}</div>
                  </td>
                  <td style={{ ...td, color: C.slate }}>{fmtDate(base.field(o))}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{money(calc[o.id]?.repairTotal)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: profitColor(calc[o.id]?.profit) }}>{money(calc[o.id]?.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Note>“Scheduled date” projects upcoming revenue from booked jobs. “Intake date” shows what came in. “Paid date” shows money actually collected (paid-in-full orders).</Note>
    </>
  );
}

/* ---------- 4. Paid ---------- */
function PaidView({ rows, calc, onOpen }) {
  const paid = rows.filter((o) => o.paid_in_full).sort((a, b) => dateOnly(b.paid_at).localeCompare(dateOnly(a.paid_at)));
  const deposits = rows.filter((o) => !o.paid_in_full && Number(o.deposit_amount) > 0);
  const collected = round2(paid.reduce((a, o) => a + (Number(o.paid_amount) || calc[o.id]?.repairTotal || 0), 0));
  const depTotal = round2(deposits.reduce((a, o) => a + (Number(o.deposit_amount) || 0), 0));
  const paidProfit = round2(paid.reduce((a, o) => a + (calc[o.id]?.profit || 0), 0));

  return (
    <>
      <SummaryStrip items={[
        ["Paid in full", paid.length],
        ["Collected", money(collected), C.green],
        ["Deposits held", money(depTotal)],
        ["Profit on paid", money(paidProfit), profitColor(paidProfit)],
      ]} />

      {paid.length === 0 ? <Empty>No skis marked paid in full yet.</Empty> : (
        <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr>
                <th style={th}>Job</th>
                <th style={th}>Paid on</th>
                <th style={{ ...th, textAlign: "right" }}>Amount paid</th>
                <th style={{ ...th, textAlign: "right" }}>Est. profit</th>
              </tr>
            </thead>
            <tbody>
              {paid.map((o) => (
                <tr key={o.id}>
                  <td style={td}><OrderCell o={o} onOpen={onOpen} /></td>
                  <td style={{ ...td, color: C.slate }}>{o.paid_at ? fmtDate(o.paid_at) : "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: C.green }}>{money(Number(o.paid_amount) || calc[o.id]?.repairTotal)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: profitColor(calc[o.id]?.profit) }}>{money(calc[o.id]?.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deposits.length > 0 && (
        <>
          <h4 style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 20, marginBottom: 8 }}>Down payments received</h4>
          <div style={{ borderRadius: 8, border: `1px solid ${C.line}`, overflow: "hidden" }}>
            {deposits.map((o) => (
              <Row key={o.id} style={{ justifyContent: "space-between", padding: "8px 12px", borderTop: `1px solid ${C.line}` }}>
                <OrderCell o={o} onOpen={onOpen} />
                <Row style={{ gap: 10 }}>
                  <span style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>of {money(calc[o.id]?.repairTotal)} total</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.teal, fontFamily: BODY }}>{money(o.deposit_amount)} down</span>
                </Row>
              </Row>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ---------- little shared UI ---------- */
function SummaryStrip({ items }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      {items.map(([label, value, color], i) => (
        <div key={i} style={{ flex: 1, minWidth: 120, borderRadius: 6, border: `1px solid ${C.line}`, padding: "10px 14px", background: "#F6F8F9" }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.slate, fontFamily: BODY }}>{label}</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color: color || C.ink, marginTop: 2 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}
function Empty({ children }) {
  return <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY, padding: "20px 4px" }}>{children}</div>;
}
function Note({ children }) {
  return <div style={{ fontSize: 11, color: C.slate, fontFamily: BODY, marginTop: 10 }}>{children}</div>;
}
