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

export default function Reports({ onBack }) {
  const [range, setRange] = useState("all");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const [p, w, h, l, s, t, pa, a] = await Promise.all([
        supabase.from("profiles").select("id, display_name, role, active"),
        supabase.from("work_orders").select("*"),
        supabase.from("hour_entries").select("*"),
        supabase.from("lake_tests").select("*"),
        supabase.from("shifts").select("*"),
        supabase.from("trips").select("*"),
        supabase.from("parts").select("*"),
        supabase.from("order_assignees").select("order_id, tech_id"),
      ]);
      setData({
        profiles: p.data || [], orders: w.data || [], hours: h.data || [],
        lake: l.data || [], shifts: s.data || [], trips: t.data || [], parts: pa.data || [], assignees: a.data || [],
      });
    })();
  }, []);

  const report = useMemo(() => {
    if (!data) return null;
    const { profiles, orders, hours, lake, shifts, trips, parts, assignees } = data;
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
      ["Total mileage (mi, all time)", totalMiles], ["Active crew", profiles.filter((p) => p.active).length],
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
        Download a multi-sheet Excel workbook: employee hours (shift vs on-skis), each ski's time at the shop, repeat visits, lake tests, mileage, parts, and more.
      </p>

      <SectionTitle right={
        <Row style={{ gap: 4 }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: range === r.key ? C.teal : "#F1F4F6", color: range === r.key ? "#fff" : C.slate }}>{r.label}</button>
          ))}
        </Row>
      }>Snapshot</SectionTitle>
      <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginBottom: 8 }}>
        Date range applies to the time sheets (employee hours, shifts, lake tests, mileage). Ski, repeat-visit and turnaround sheets always cover all time.
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
