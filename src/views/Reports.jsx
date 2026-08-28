import { useState, useEffect, useMemo } from "react";
import { supabase, C, DISPLAY, BODY, today, round2, fmtDate, fmtTime } from "../lib/supabase";
import { Card, Row, SectionTitle, btn } from "../lib/ui";
import { RANGES, inRange } from "./ShiftClock";

const DAY = 86400000;

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

const skiText = (o) => (o ? [o.year, o.make, o.model].filter(Boolean).join(" ") : "");
const skiFull = (o) => (o ? `${o.customer_name}${skiText(o) ? " — " + skiText(o) : ""}` : "—");

const isNum = (v) => v !== "" && v != null && !isNaN(Number(String(v).replace(/[%$,]/g, "")));
const numVal = (v) => Number(String(v).replace(/[%$,]/g, "")) || 0;

// A simple, theme-consistent horizontal bar chart from [label, value] pairs.
function BarChart({ data, color = C.teal, unit = "" }) {
  const max = Math.max(1, ...data.map((d) => d[1]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map(([label, val], i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 90, fontSize: 12, color: C.slate, fontFamily: BODY, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={label}>{label}</div>
          <div style={{ flex: 1, background: "#F1F4F6", borderRadius: 4, height: 18, position: "relative" }}>
            <div style={{ width: `${(val / max) * 100}%`, background: color, height: "100%", borderRadius: 4, minWidth: val > 0 ? 2 : 0 }} />
          </div>
          <div style={{ width: 60, fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: BODY }}>{val}{unit}</div>
        </div>
      ))}
    </div>
  );
}

export default function Reports({ onBack }) {
  const [range, setRange] = useState("all");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sheetIdx, setSheetIdx] = useState(0);
  const [tblSearch, setTblSearch] = useState("");
  const [sort, setSort] = useState({ col: null, dir: 1 });

  useEffect(() => {
    (async () => {
      const [p, w, h, l, s, t, pa, a, ex] = await Promise.all([
        supabase.from("profiles").select("id, display_name, role, active"),
        supabase.from("work_orders").select("*"),
        supabase.from("hour_entries").select("*"),
        supabase.from("lake_tests").select("*"),
        supabase.from("shifts").select("*"),
        supabase.from("trips").select("*"),
        supabase.from("parts").select("*"),
        supabase.from("order_assignees").select("order_id, tech_id"),
        supabase.from("expenses").select("*"),
      ]);
      setData({
        profiles: p.data || [], orders: (w.data || []).filter((o) => !o.limbo), hours: h.data || [],
        lake: l.data || [], shifts: s.data || [], trips: t.data || [], parts: pa.data || [], assignees: a.data || [], expenses: ex.data || [],
      });
    })();
  }, []);

  const report = useMemo(() => {
    if (!data) return null;
    const { profiles, orders, hours, lake, shifts, trips, parts, assignees, expenses } = data;
    const asgByOrder = {};
    (assignees || []).forEach((a) => { (asgByOrder[a.order_id] = asgByOrder[a.order_id] || []).push(a.tech_id); });
    const nameOf = (id) => profiles.find((x) => x.id === id)?.display_name || "—";
    const orderOf = (id) => orders.find((o) => o.id === id);
    const rangeLabel = RANGES.find((r) => r.key === range)?.label || "All time";

    const lastActivity = (oid) => {
      const ds = [
        ...hours.filter((x) => x.order_id === oid).map((x) => x.work_date),
        ...lake.filter((x) => x.order_id === oid).map((x) => x.test_date),
      ].filter(Boolean).sort();
      return ds.length ? new Date(ds[ds.length - 1]) : null;
    };
    const daysAtShop = (o) => {
      const start = new Date(o.created_at);
      let end;
      if (o.status === "closed") end = o.closed_at ? new Date(o.closed_at) : (lastActivity(o.id) || start);
      else end = new Date();
      return Math.max(0, Math.round((end - start) / DAY));
    };

    const empAoa = [["Employee", "Role", "Shift hrs", "Job hrs", "Lake test hrs", "Mileage (mi)", "On-jobs %"]];
    profiles.forEach((p) => {
      let shiftMs = 0;
      shifts.forEach((s) => { if (s.tech_id === p.id && s.ended_at && inRange(s.started_at, range)) shiftMs += new Date(s.ended_at) - new Date(s.started_at); });
      const jobHrs = round2(hours.filter((x) => x.tech_id === p.id && inRange(x.work_date, range)).reduce((a, x) => a + Number(x.hours), 0));
      const lakeHrs = round2(lake.filter((x) => x.tech_id === p.id && inRange(x.test_date, range)).reduce((a, x) => a + x.seconds, 0) / 3600);
      const miles = round2(trips.filter((x) => x.tech_id === p.id && inRange(x.trip_date, range)).reduce((a, x) => a + Number(x.miles), 0));
      const shiftHrs = round2(shiftMs / 3600000);
      const util = shiftHrs > 0 ? Math.round((jobHrs / shiftHrs) * 100) : "";
      empAoa.push([p.display_name, p.role, shiftHrs, jobHrs, lakeHrs, miles, util === "" ? "" : util + "%"]);
    });

    const woAoa = [["Customer", "Phone", "Ski", "Hull ID", "Issue", "Status", "Intake", "Closed", "Days at shop", "Labor hrs", "Lake tests", "Passed", "Failed", "Assigned to"]];
    orders.forEach((o) => {
      const oh = hours.filter((x) => x.order_id === o.id);
      const ol = lake.filter((x) => x.order_id === o.id);
      woAoa.push([
        o.customer_name, o.customer_phone || "", skiText(o), o.hull_id || "", o.issue, o.status,
        fmtDate(o.created_at), o.closed_at ? fmtDate(o.closed_at) : "",
        daysAtShop(o), round2(oh.reduce((a, x) => a + Number(x.hours), 0)),
        ol.length, ol.filter((x) => x.result === "passed").length, ol.filter((x) => x.result === "failed").length,
        (asgByOrder[o.id] || []).map(nameOf).join(", "),
      ]);
    });

    const groups = {};
    orders.forEach((o) => {
      const key = (o.hull_id && o.hull_id.trim()) ? `HIN ${o.hull_id.trim()}` : `${o.customer_name} / ${skiText(o) || "ski"}`;
      (groups[key] = groups[key] || []).push(o);
    });
    const visitAoa = [["Ski", "Visits", "First visit", "Last visit", "Currently in shop?"]];
    Object.entries(groups).map(([key, os]) => {
      const dates = os.map((o) => new Date(o.created_at)).sort((a, b) => a - b);
      const openNow = os.some((o) => o.status !== "closed");
      return { key, n: os.length, first: dates[0], last: dates[dates.length - 1], openNow };
    }).sort((a, b) => b.n - a.n).forEach((g) => {
      visitAoa.push([g.key, g.n, fmtDate(g.first), fmtDate(g.last), g.openNow ? "Yes" : "No"]);
    });

    const timeAoa = [["Date", "Employee", "Ski", "Hours", "Note", "From clock?"]];
    hours.filter((x) => inRange(x.work_date, range)).sort((a, b) => (a.work_date < b.work_date ? 1 : -1))
      .forEach((x) => timeAoa.push([fmtDate(x.work_date), nameOf(x.tech_id), skiFull(orderOf(x.order_id)), round2(Number(x.hours)), x.note || "", x.clocked ? "Yes" : ""]));

    const shiftAoa = [["Employee", "Date", "Start", "End", "Hours"]];
    shifts.filter((s) => s.ended_at && inRange(s.started_at, range)).sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
      .forEach((s) => shiftAoa.push([nameOf(s.tech_id), fmtDate(s.started_at), fmtTime(s.started_at), fmtTime(s.ended_at), round2((new Date(s.ended_at) - new Date(s.started_at)) / 3600000)]));

    const lakeAoa = [["Date", "Ski", "Employee", "Minutes", "Result", "Note"]];
    lake.filter((x) => inRange(x.test_date, range)).sort((a, b) => (a.test_date < b.test_date ? 1 : -1))
      .forEach((x) => lakeAoa.push([fmtDate(x.test_date), skiFull(orderOf(x.order_id)), nameOf(x.tech_id), round2(x.seconds / 60), x.result, x.note || ""]));

    const mileAoa = [["Date", "Employee", "Miles", "Purpose", "Method"]];
    trips.filter((x) => inRange(x.trip_date, range)).sort((a, b) => (a.trip_date < b.trip_date ? 1 : -1))
      .forEach((x) => mileAoa.push([fmtDate(x.trip_date), nameOf(x.tech_id), round2(Number(x.miles)), x.purpose || "", x.method]));

    const partAoa = [["Ski", "Part", "Qty", "Status", "Note"]];
    parts.forEach((x) => partAoa.push([skiFull(orderOf(x.order_id)), x.name, x.qty, x.status, x.note || ""]));

    const months = {};
    orders.forEach((o) => { const m = String(o.created_at).slice(0, 7); months[m] = (months[m] || 0) + 1; });
    const seasonAoa = [["Month", "Intakes"]];
    Object.keys(months).sort().forEach((m) => seasonAoa.push([m, months[m]]));

    const expAoa = [["Date", "Employee", "Amount", "Description"]];
    (expenses || []).filter((x) => inRange(x.expense_date, range)).sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1))
      .forEach((x) => expAoa.push([fmtDate(x.expense_date), nameOf(x.tech_id), round2(Number(x.amount)), x.description || ""]));
    const totalExpenses = round2((expenses || []).reduce((a, x) => a + Number(x.amount), 0));

    const closed = orders.filter((o) => o.status === "closed");
    const open = orders.filter((o) => o.status !== "closed");
    const avgTurn = closed.length ? round2(closed.reduce((a, o) => a + daysAtShop(o), 0) / closed.length) : "—";
    const totalLabor = round2(hours.reduce((a, x) => a + Number(x.hours), 0));
    const passed = lake.filter((x) => x.result === "passed").length;
    const failed = lake.filter((x) => x.result === "failed").length;
    const passRate = passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) + "%" : "—";
    const totalMiles = round2(trips.reduce((a, x) => a + Number(x.miles), 0));
    const sumAoa = [
      ["Jet Ski Shop — report"], ["Generated", new Date().toLocaleString()], ["Time sheets cover", rangeLabel], [],
      ["Open work orders", open.length], ["Closed work orders", closed.length], ["Total work orders", orders.length],
      ["Avg turnaround (closed, days)", avgTurn], ["Total labor hours (all time)", totalLabor],
      ["Lake tests — passed", passed], ["Lake tests — failed", failed], ["Lake test pass rate", passRate],
      ["Total mileage (mi, all time)", totalMiles], ["Total receipt reimbursements ($, all time)", totalExpenses], ["Active crew", profiles.filter((p) => p.active).length],
    ];

    return {
      preview: { open: open.length, closed: closed.length, avgTurn, totalLabor, passRate, totalMiles },
      sheets: [
        { name: "Summary", aoa: sumAoa, cols: [30, 22] },
        { name: "Employees", aoa: empAoa, cols: [20, 10, 10, 10, 13, 12, 10] },
        { name: "Skis", aoa: woAoa, cols: [18, 14, 20, 16, 30, 12, 11, 11, 12, 10, 11, 8, 8, 16] },
        { name: "Repeat visits", aoa: visitAoa, cols: [30, 8, 12, 12, 18] },
        { name: "Time entries", aoa: timeAoa, cols: [11, 20, 26, 8, 30, 11] },
        { name: "Shifts", aoa: shiftAoa, cols: [20, 11, 9, 9, 8] },
        { name: "Lake tests", aoa: lakeAoa, cols: [11, 26, 20, 9, 9, 30] },
        { name: "Mileage", aoa: mileAoa, cols: [11, 20, 8, 24, 9] },
        { name: "Reimbursements", aoa: expAoa, cols: [11, 20, 10, 34] },
        { name: "Parts", aoa: partAoa, cols: [26, 22, 6, 12, 24] },
        { name: "Seasonality", aoa: seasonAoa, cols: [12, 10] },
      ],
    };
  }, [data, range]);

  async function download() {
    if (!report) return;
    setBusy(true); setErr("");
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.utils.book_new();
      report.sheets.forEach((sh) => {
        const ws = XLSX.utils.aoa_to_sheet(sh.aoa);
        if (sh.cols) ws["!cols"] = sh.cols.map((w) => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, sh.name);
      });
      XLSX.writeFile(wb, `jetski-shop-report-${today()}.xlsx`);
    } catch (e) {
      setErr(e.message || "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  const stat = (label, value) => (
    <div style={{ flex: 1, minWidth: 130, borderRadius: 6, border: `1px solid ${C.line}`, padding: "12px 14px", background: "#F6F8F9" }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.slate, fontFamily: BODY }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color: C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Reports</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Browse every sheet right here — filter and sort each table, and see hours and intakes at a glance — or download the whole thing as a multi-sheet Excel workbook.
      </p>

      <SectionTitle right={
        <Row style={{ gap: 4 }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: range === r.key ? C.teal : "#F1F4F6", color: range === r.key ? "#fff" : C.slate }}>{r.label}</button>
          ))}
        </Row>
      }>Snapshot</SectionTitle>
      <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginBottom: 8 }}>
        Date range applies to the time sheets (employee hours, shifts, lake tests, mileage, receipts). Ski, repeat-visit and turnaround sheets always cover all time.
      </div>

      {!report ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Loading shop data…</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {stat("Open skis", report.preview.open)}
            {stat("Closed", report.preview.closed)}
            {stat("Avg turnaround", report.preview.avgTurn === "—" ? "—" : `${report.preview.avgTurn} d`)}
            {stat("Labor hrs", report.preview.totalLabor)}
            {stat("Lake pass rate", report.preview.passRate)}
            {stat("Mileage", `${report.preview.totalMiles} mi`)}
          </div>

          {/* Charts */}
          {(() => {
            const seasonSheet = report.sheets.find((s) => s.name === "Seasonality");
            const empSheet = report.sheets.find((s) => s.name === "Employees");
            const seasonData = seasonSheet ? seasonSheet.aoa.slice(1).map((r) => [r[0], numVal(r[1])]) : [];
            const empData = empSheet
              ? empSheet.aoa.slice(1).map((r) => [r[0], numVal(r[3])]).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1])
              : [];
            if (!seasonData.length && !empData.length) return null;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 18 }}>
                {empData.length > 0 && (
                  <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginBottom: 10 }}>Job hours by employee</div>
                    <BarChart data={empData} color={C.teal} unit="h" />
                  </div>
                )}
                {seasonData.length > 0 && (
                  <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginBottom: 10 }}>Intakes by month</div>
                    <BarChart data={seasonData} color={C.orange} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Browse every sheet in-app */}
          <SectionTitle>Browse the data</SectionTitle>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {report.sheets.map((s, i) => (
              <button key={s.name} onClick={() => { setSheetIdx(i); setSort({ col: null, dir: 1 }); setTblSearch(""); }} style={{
                fontFamily: BODY, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 999,
                background: sheetIdx === i ? C.ink : "#F1F4F6", color: sheetIdx === i ? "#fff" : C.slate,
              }}>{s.name}</button>
            ))}
          </div>
          {(() => {
            const sheet = report.sheets[sheetIdx] || report.sheets[0];
            const header = sheet.aoa[0] || [];
            let body = sheet.aoa.slice(1);
            const q = tblSearch.trim().toLowerCase();
            if (q) body = body.filter((row) => row.some((c) => String(c ?? "").toLowerCase().includes(q)));
            if (sort.col != null) {
              body = body.slice().sort((a, b) => {
                const av = a[sort.col], bv = b[sort.col];
                if (isNum(av) && isNum(bv)) return (numVal(av) - numVal(bv)) * sort.dir;
                return String(av ?? "").localeCompare(String(bv ?? "")) * sort.dir;
              });
            }
            return (
              <>
                <Row style={{ marginBottom: 8 }}>
                  <input value={tblSearch} onChange={(e) => setTblSearch(e.target.value)} placeholder={`Filter ${sheet.name.toLowerCase()}…`} style={{ fontFamily: BODY, fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 6, padding: "7px 10px", background: "#FBFCFD", maxWidth: 280, width: "100%" }} />
                  <span style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>{body.length} row{body.length === 1 ? "" : "s"}</span>
                </Row>
                <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 8 }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: BODY, fontSize: 13 }}>
                    <thead>
                      <tr>
                        {header.map((h, ci) => {
                          const active = sort.col === ci;
                          return (
                            <th key={ci} onClick={() => setSort((s) => ({ col: ci, dir: s.col === ci ? -s.dir : 1 }))} style={{
                              position: "sticky", top: 0, textAlign: "left", padding: "8px 10px", background: C.ink, color: "#fff",
                              fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
                            }}>{h}{active ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {body.length === 0 ? (
                        <tr><td colSpan={header.length || 1} style={{ padding: 14, color: C.slate, textAlign: "center" }}>No rows.</td></tr>
                      ) : body.map((row, ri) => (
                        <tr key={ri} style={{ background: ri % 2 ? "#F6F8F9" : "#fff" }}>
                          {header.map((_, ci) => (
                            <td key={ci} style={{ padding: "7px 10px", borderTop: `1px solid ${C.line}`, color: C.ink, whiteSpace: isNum(row[ci]) ? "nowrap" : "normal" }}>{row[ci] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}

          <div style={{ marginTop: 16 }}>
            <button onClick={download} disabled={busy} style={{ ...btn("#fff", C.ink), opacity: busy ? 0.6 : 1 }}>
              {busy ? "Building…" : "⬇ Download Excel"}
            </button>
          </div>
          {err ? <div style={{ marginTop: 8, fontSize: 13, color: C.red, fontFamily: BODY }}>{err}</div> : null}
        </>
      )}
    </Card>
  );
}