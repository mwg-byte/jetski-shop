import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, round2, fmtDate, fmtTime, isManager } from "../lib/supabase";
import { Card, Row, Select, SectionTitle } from "../lib/ui";
import { useAuth } from "../AuthContext";

const DAY = 86400000;

/* Monday-start week containing date d (Date or ISO string) -> ISO yyyy-mm-dd of that Monday */
function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function weekStart(d) {
  const date = new Date(typeof d === "string" ? d + "T12:00:00" : d);
  const day = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - day);
  return ymdLocal(date);
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return ymdLocal(d);
}

const skiLabel = (o) => {
  if (!o) return "—";
  const ski = [o.year, o.make, o.model].filter(Boolean).join(" ");
  return `${o.customer_name}${ski ? " — " + ski : ""}`;
};

export default function MyHours({ crew, orders, onBack }) {
  const { profile, session } = useAuth();
  const myEmail = session?.user?.email || "";
  const mgr = isManager(profile.role);
  const [who, setWho] = useState(profile.id);
  const thisWeek = weekStart(new Date());
  const [week, setWeek] = useState(thisWeek);
  const [shifts, setShifts] = useState([]);
  const [hours, setHours] = useState([]);
  const [lake, setLake] = useState([]);
  const [trips, setTrips] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [rate, setRate] = useState(0);
  const [settings, setSettings] = useState(null);
  const [showStub, setShowStub] = useState(false);

  async function load() {
    const [s, h, l, t, x, pr] = await Promise.all([
      supabase.from("shifts").select("*").eq("tech_id", who).order("started_at", { ascending: false }),
      supabase.from("hour_entries").select("*").eq("tech_id", who).order("work_date", { ascending: false }),
      supabase.from("lake_tests").select("*").eq("tech_id", who).order("test_date", { ascending: false }),
      supabase.from("trips").select("*").eq("tech_id", who).order("trip_date", { ascending: false }),
      supabase.from("expenses").select("*").eq("tech_id", who).order("expense_date", { ascending: false }),
      supabase.from("pay_rates").select("hourly_rate").eq("tech_id", who).maybeSingle(),
    ]);
    setShifts(s.data || []); setHours(h.data || []); setLake(l.data || []); setTrips(t.data || []);
    setExpenses(x.data || []); setRate(pr.data?.hourly_rate || 0);
  }
  useEffect(() => { load(); }, [who]);
  useEffect(() => { supabase.from("settings").select("*").maybeSingle().then(({ data }) => setSettings(data || {})); }, []);

  const orderOf = (id) => orders.find((o) => o.id === id);

  const weekStartMs = new Date(week + "T00:00:00").getTime();
  const weekEndMs = weekStartMs + 7 * DAY;
  const inWeek = (val) => {
    if (!val) return false;
    const t = new Date(typeof val === "string" && val.length === 10 ? val + "T12:00:00" : val).getTime();
    return t >= weekStartMs && t < weekEndMs;
  };

  const shiftRows = shifts.filter((s) => s.ended_at && inWeek(s.started_at));
  const shiftHrs = round2(shiftRows.reduce((a, s) => a + (new Date(s.ended_at) - new Date(s.started_at)) / 3600000, 0));
  const hourRows = hours.filter((h) => inWeek(h.work_date));
  const jobHrs = round2(hourRows.reduce((a, h) => a + Number(h.hours), 0));
  const lakeRows = lake.filter((l) => inWeek(l.test_date));
  const lakeHrs = round2(lakeRows.reduce((a, l) => a + l.seconds, 0) / 3600);
  const tripRows = trips.filter((t) => inWeek(t.trip_date));
  const miles = round2(tripRows.reduce((a, t) => a + Number(t.miles), 0));
  const expWeek = expenses.filter((x) => inWeek(x.expense_date));
  const reimb = round2(expWeek.reduce((a, x) => a + Number(x.amount), 0));
  const otThreshold = settings?.ot_weekly_threshold ?? 40;
  const otMult = settings?.ot_multiplier ?? 1.5;
  const mileageRate = settings?.mileage_rate ?? 0.7;
  const regHrs = round2(Math.min(shiftHrs, otThreshold));
  const otHrs = round2(Math.max(0, shiftHrs - otThreshold));
  const regPay = round2(regHrs * rate);
  const otPay = round2(otHrs * rate * otMult);
  const mileagePay = round2(miles * mileageRate);
  const grossPay = round2(regPay + otPay + mileagePay + reimb);

  const exportBtn = { fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 6, background: "#F1F4F6", color: C.ink };
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function weekCsv() {
    const esc = (c) => `"${String(c ?? "").replace(/"/g, '""')}"`;
    const rows = [["Type", "Date", "Detail", "Hours/Miles"]];
    shiftRows.forEach((s) => rows.push(["Shift", fmtDate(s.started_at), `${fmtTime(s.started_at)}-${fmtTime(s.ended_at)}`, round2((new Date(s.ended_at) - new Date(s.started_at)) / 3600000)]));
    hourRows.forEach((h) => rows.push(["Job", fmtDate(h.work_date), skiLabel(orderOf(h.order_id)) + (h.note ? ` (${h.note})` : ""), round2(Number(h.hours))]));
    lakeRows.forEach((l) => rows.push(["Lake test", fmtDate(l.test_date), skiLabel(orderOf(l.order_id)), round2(l.seconds / 3600)]));
    tripRows.forEach((t) => rows.push(["Mileage", fmtDate(t.trip_date), t.purpose || "Trip", round2(Number(t.miles))]));
    rows.push(["", "", "", ""]);
    rows.push(["Total", "", "On-shift hrs", shiftHrs]);
    rows.push(["Total", "", "Job hrs", jobHrs]);
    rows.push(["Total", "", "Lake hrs", lakeHrs]);
    rows.push(["Total", "", "Miles", miles]);
    return rows.map((r) => r.map(esc).join(",")).join("\n");
  }
  function downloadCsv() {
    download(`hours_${(me?.display_name || "me").replace(/\s+/g, "_")}_${week}.csv`, weekCsv(), "text/csv");
  }
  function emailHours() {
    const subject = `Hours — ${me?.display_name || "me"} — ${weekLabel}`;
    const block = (label, lines2) => lines2.length ? `${label}:\n${lines2.join("\n")}\n\n` : "";
    const body =
      `Week of ${weekLabel}\n\n` +
      `On-shift: ${shiftHrs} hrs\nJob time: ${jobHrs} hrs\nLake testing: ${lakeHrs} hrs\nMileage: ${miles} mi\n\n` +
      block("Shifts", shiftRows.map((s) => `  ${fmtDate(s.started_at)}  ${fmtTime(s.started_at)}-${fmtTime(s.ended_at)}  ${round2((new Date(s.ended_at) - new Date(s.started_at)) / 3600000)} hrs`)) +
      block("Job time", hourRows.map((h) => `  ${fmtDate(h.work_date)}  ${skiLabel(orderOf(h.order_id))}  ${round2(Number(h.hours))} hrs`)) +
      block("Lake testing", lakeRows.map((l) => `  ${fmtDate(l.test_date)}  ${skiLabel(orderOf(l.order_id))}  ${round2(l.seconds / 60)} min`)) +
      block("Mileage", tripRows.map((t) => `  ${fmtDate(t.trip_date)}  ${t.purpose || "Trip"}  ${round2(Number(t.miles))} mi`));
    window.location.href = `mailto:${myEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const me = crew.find((c) => c.id === who);
  const TEST_COLOR = { pending: C.slate, passed: C.green, failed: C.red };
  const isThisWeek = week === thisWeek;
  const weekLabel = `${fmtDate(week)} – ${fmtDate(addDays(week, 6))}`;

  const stat = (label, value, unit, color) => (
    <div style={{ flex: 1, minWidth: 120, borderRadius: 6, border: `1px solid ${C.line}`, padding: "12px 14px", background: "#F6F8F9" }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.slate, fontFamily: BODY }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color, marginTop: 2 }}>{value}<span style={{ fontSize: 13, fontWeight: 600, color: C.slate, marginLeft: 4 }}>{unit}</span></div>
    </div>
  );

  const navBtn = (label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 6, background: "#F1F4F6", color: disabled ? "#B7C2CA" : C.ink, opacity: disabled ? 0.6 : 1 }}>{label}</button>
  );

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>
        {who === profile.id ? "My hours" : `${me?.display_name || "Crew"} — hours`}
      </h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Your hours and mileage for the week, Monday through Sunday. Use the arrows to look back at past weeks — each week totals on its own.
      </p>

      {mgr && (
        <Row style={{ marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Viewing</span>
          <Select value={who} onChange={(e) => setWho(e.target.value)} style={{ minWidth: 160 }}>
            {crew.map((c) => <option key={c.id} value={c.id}>{c.display_name}{c.id === profile.id ? " (me)" : ""}</option>)}
          </Select>
        </Row>
      )}

      <div style={{ marginTop: 18 }}>
        <Row style={{ gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          {navBtn("‹ Prev week", () => setWeek(addDays(week, -7)), false)}
          {navBtn("Next week ›", () => setWeek(addDays(week, 7)), isThisWeek)}
          {!isThisWeek && navBtn("Jump to this week", () => setWeek(thisWeek), false)}
          <button onClick={() => setShowStub(true)} style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, padding: "6px 12px", borderRadius: 6, background: C.teal, color: "#fff", marginLeft: "auto" }}>Pay stub</button>
        </Row>
        <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: C.ink }}>
          {isThisWeek ? "This week" : "Week of"} · {weekLabel}
        </div>
      </div>

      {showStub && (
        <PayStub name={me?.display_name || "Employee"} period={weekLabel} regHrs={regHrs} otHrs={otHrs} rate={rate} otMult={otMult}
          regPay={regPay} otPay={otPay} miles={miles} mileageRate={mileageRate} mileagePay={mileagePay}
          reimbItems={expWeek} reimb={reimb} gross={grossPay} email={myEmail} onClose={() => setShowStub(false)} />
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {stat("On shift", shiftHrs, "hrs", C.ink)}
        {stat("Job time", jobHrs, "hrs", C.teal)}
        {stat("Lake testing", lakeHrs, "hrs", C.water)}
        {stat("Mileage", miles, "mi", C.orange)}
      </div>

      <Row style={{ gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Export this week</span>
        <button onClick={downloadCsv} style={exportBtn}>Download CSV</button>
        <button onClick={emailHours} style={exportBtn}>Email to me</button>
      </Row>

      <SectionTitle>Shifts</SectionTitle>
      {shiftRows.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No shifts this week.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {shiftRows.map((s) => (
            <Row key={s.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ color: C.slate }}>{fmtDate(s.started_at)}</span>
              <span style={{ color: C.slate }}>{fmtTime(s.started_at)} – {fmtTime(s.ended_at)}</span>
              <span style={{ marginLeft: "auto", fontWeight: 700, color: C.teal }}>{round2((new Date(s.ended_at) - new Date(s.started_at)) / 3600000)} hrs</span>
            </Row>
          ))}
        </div>
      )}

      <SectionTitle>Job time</SectionTitle>
      {hourRows.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No job hours this week.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {hourRows.map((h) => (
            <Row key={h.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ color: C.slate, minWidth: 70 }}>{fmtDate(h.work_date)}</span>
              <span style={{ color: C.ink, fontWeight: 600 }}>{skiLabel(orderOf(h.order_id))}</span>
              {h.note ? <span style={{ color: C.slate, fontSize: 12 }}>{h.note}</span> : null}
              <span style={{ marginLeft: "auto", fontWeight: 700, color: C.teal }}>{round2(Number(h.hours))} hrs</span>
            </Row>
          ))}
        </div>
      )}

      <SectionTitle>Lake testing</SectionTitle>
      {lakeRows.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No lake tests this week.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {lakeRows.map((l) => (
            <Row key={l.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ color: C.slate, minWidth: 70 }}>{fmtDate(l.test_date)}</span>
              <span style={{ color: C.ink, fontWeight: 600 }}>{skiLabel(orderOf(l.order_id))}</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: TEST_COLOR[l.result] || C.slate }}>{l.result}</span>
              <span style={{ marginLeft: "auto", fontWeight: 700, color: C.teal }}>{round2(l.seconds / 60)} min</span>
            </Row>
          ))}
        </div>
      )}

      <SectionTitle>Mileage</SectionTitle>
      {tripRows.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No trips this week.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {tripRows.map((t) => (
            <Row key={t.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ color: C.slate, minWidth: 70 }}>{fmtDate(t.trip_date)}</span>
              {t.purpose ? <span style={{ color: C.ink }}>{t.purpose}</span> : <span style={{ color: C.slate }}>{t.method === "gps" ? "GPS trip" : "Manual trip"}</span>}
              <span style={{ marginLeft: "auto", fontWeight: 700, color: C.orange }}>{round2(Number(t.miles))} mi</span>
            </Row>
          ))}
        </div>
      )}
    </Card>
  );
}

function PayStub({ name, period, regHrs, otHrs, rate, otMult, regPay, otPay, miles, mileageRate, mileagePay, reimbItems, reimb, gross, email, onClose }) {
  const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
  function emailStub() {
    const subject = `Pay stub — ${name} — ${period}`;
    const lines = ["High Country Powersports — Pay Stub", `Employee: ${name}`, `Pay period: ${period}`, "", `Regular: ${regHrs} hrs @ ${money(rate)} = ${money(regPay)}`];
    if (otHrs > 0) lines.push(`Overtime: ${otHrs} hrs = ${money(otPay)}`);
    lines.push(`Mileage: ${miles} mi @ ${money(mileageRate)} = ${money(mileagePay)}`);
    if (reimb > 0) lines.push(`Reimbursements: ${money(reimb)}`);
    lines.push("", `Gross pay: ${money(gross)}`, "", "Gross earnings summary; does not reflect tax withholding or other deductions.");
    window.location.href = `mailto:${email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  }
  const r = (label, hrs, rt, amt) => (
    <div style={{ display: "flex", borderBottom: "1px solid #eee" }}>
      <span style={{ flex: 2, padding: "6px 8px", fontFamily: BODY, fontSize: 13, color: "#111" }}>{label}</span>
      <span style={{ flex: 1, padding: "6px 8px", textAlign: "right", fontFamily: BODY, fontSize: 13, color: "#111" }}>{hrs}</span>
      <span style={{ flex: 1, padding: "6px 8px", textAlign: "right", fontFamily: BODY, fontSize: 13, color: "#111" }}>{rt}</span>
      <span style={{ flex: 1, padding: "6px 8px", textAlign: "right", fontFamily: BODY, fontSize: 13, color: "#111" }}>{money(amt)}</span>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(8,20,30,0.6)", overflow: "auto", padding: 16 }}>
      <style>{`@media print { body * { visibility: hidden !important; } #stub, #stub * { visibility: visible !important; } #stub { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; } .no-print { display: none !important; } }`}</style>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <button onClick={() => window.print()} style={{ background: C.teal, color: "#fff", fontWeight: 700, fontFamily: BODY, fontSize: 14, padding: "10px 16px", borderRadius: 8 }}>Print / Save as PDF</button>
          <button onClick={emailStub} style={{ background: "#fff", color: C.teal, fontWeight: 700, fontFamily: BODY, fontSize: 14, padding: "10px 16px", borderRadius: 8 }}>Email to me</button>
          <button onClick={onClose} style={{ background: "#fff", color: C.ink, fontWeight: 700, fontFamily: BODY, fontSize: 14, padding: "10px 16px", borderRadius: 8 }}>Close</button>
        </div>
        <div id="stub" style={{ background: "#fff", padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
          <div style={{ textAlign: "center", marginBottom: 10 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: "#111" }}>High Country Powersports</div>
            <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 600, color: "#111" }}>Pay Stub</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontFamily: BODY, fontSize: 13, color: "#111", marginBottom: 12 }}>
            <span><b>Employee:</b> {name}</span>
            <span><b>Pay period:</b> {period}</span>
          </div>
          <div style={{ border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ display: "flex", background: "#1f1f1f", color: "#fff", fontFamily: BODY, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <span style={{ flex: 2, padding: "5px 8px" }}>Earnings</span>
              <span style={{ flex: 1, padding: "5px 8px", textAlign: "right" }}>Hours</span>
              <span style={{ flex: 1, padding: "5px 8px", textAlign: "right" }}>Rate</span>
              <span style={{ flex: 1, padding: "5px 8px", textAlign: "right" }}>Amount</span>
            </div>
            {r("Regular", regHrs, money(rate), regPay)}
            {otHrs > 0 && r("Overtime", otHrs, money(round2(rate * otMult)), otPay)}
            {r("Mileage", `${miles} mi`, money(mileageRate), mileagePay)}
            {reimb > 0 && r("Reimbursements", "—", "—", reimb)}
            <div style={{ display: "flex", background: "#F6F8F9" }}>
              <span style={{ flex: 4, padding: "8px", fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, color: "#111" }}>Gross pay</span>
              <span style={{ flex: 1, padding: "8px", textAlign: "right", fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, color: "#111" }}>{money(gross)}</span>
            </div>
          </div>
          {reimbItems.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 4 }}>Reimbursement detail</div>
              {reimbItems.map((x) => (
                <div key={x.id} style={{ display: "flex", justifyContent: "space-between", fontFamily: BODY, fontSize: 12, color: "#333", padding: "2px 0" }}>
                  <span>{fmtDate(x.expense_date)} — {x.description}</span>
                  <span>{money(x.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {!rate && <p style={{ fontFamily: BODY, fontSize: 12, color: "#B23A48", marginTop: 12 }}>No hourly rate set for this employee yet — pay shows $0. Set it in the Crew screen.</p>}
          <p style={{ fontFamily: BODY, fontSize: 11, color: "#555", marginTop: 14 }}>
            Gross earnings summary for the period shown. This statement does not reflect tax withholding or other deductions.
          </p>
        </div>
      </div>
    </div>
  );
}
