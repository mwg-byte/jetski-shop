import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, round2, fmtDate, today, isManager } from "../lib/supabase";
import { Card, Row, TextInput, Select, Label, SectionTitle, btn, btnSm } from "../lib/ui";
import { useAuth } from "../AuthContext";

/* Monday-start week containing `d` */
function weekStart(d) {
  const date = new Date(d + "T12:00:00");
  const day = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const overlapMs = (s, e, ws, we) => {
  const a = Math.max(new Date(s).getTime(), new Date(ws).getTime());
  const b = Math.min(new Date(e).getTime(), new Date(we).getTime());
  return Math.max(0, b - a);
};

export default function Payroll({ crew, settings, onBack }) {
  const { profile } = useAuth();
  const isOwner = profile.role === "owner";
  const mgr = isManager(profile.role);
  const [pending, setPending] = useState([]);
  const [pendingTrips, setPendingTrips] = useState([]);
  const [manualReimb, setManualReimb] = useState([]);
  const [mrForm, setMrForm] = useState({ tech_id: "", expense_date: today(), amount: "", description: "" });
  const [mrPaidNow, setMrPaidNow] = useState(false);
  const [mrErr, setMrErr] = useState("");
  const [mrSaving, setMrSaving] = useState(false);
  const [start, setStart] = useState(weekStart(new Date().toISOString().slice(0, 10)));
  const [periodLen, setPeriodLen] = useState(7); // 7 or 14 days
  const [shifts, setShifts] = useState([]);
  const [trips, setTrips] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);

  const end = addDays(start, periodLen);
  const otThreshold = settings?.ot_weekly_threshold ?? 40;
  const otMult = settings?.ot_multiplier ?? 1.5;
  const mileageRate = settings?.mileage_rate ?? 0.7;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("shifts").select("*").not("ended_at", "is", null).gte("started_at", start).lt("started_at", end + "T23:59:59"),
      supabase.from("trips").select("*").gte("trip_date", start).lt("trip_date", end),
      supabase.from("pay_rates").select("*"),
      supabase.from("expenses").select("*").gte("expense_date", start).lt("expense_date", end),
    ]).then(([s, t, r, x]) => {
      setShifts(s.data || []); setTrips(t.data || []); setExpenses(x.data || []);
      const map = {}; (r.data || []).forEach((y) => { map[y.tech_id] = { rate: Number(y.hourly_rate) || 0, pay_type: y.pay_type || "hourly", salary: Number(y.salary) || 0 }; });
      setRates(map); setLoading(false);
    });
  }, [start, periodLen]);

  useEffect(() => {
    supabase.from("expenses").select("*").eq("reimbursed", false).order("expense_date").then(({ data }) => setPending(data || []));
    supabase.from("trips").select("*").eq("reimbursed", false).order("trip_date").then(({ data }) => setPendingTrips(data || []));
    supabase.from("expenses").select("*").eq("source", "manual").order("expense_date", { ascending: false }).then(({ data }) => setManualReimb(data || []));
  }, []);

  useEffect(() => {
    if (!mrForm.tech_id && crew.length) setMrForm((f) => ({ ...f, tech_id: crew[0].id }));
  }, [crew]);

  async function addManualReimbursement() {
    const amt = Number(mrForm.amount);
    if (!mrForm.tech_id || !amt || amt <= 0 || !mrForm.description.trim()) {
      setMrErr("Pick a person, enter an amount greater than 0, and a short note.");
      return;
    }
    setMrErr(""); setMrSaving(true);
    const patch = mrPaidNow ? { reimbursed: true, reimbursed_at: new Date().toISOString(), reimbursed_by: profile.id } : { reimbursed: false };
    const { data, error } = await supabase.from("expenses").insert({
      tech_id: mrForm.tech_id, expense_date: mrForm.expense_date, amount: amt,
      description: mrForm.description.trim(), source: "manual", ...patch,
    }).select().single();
    setMrSaving(false);
    if (error) { setMrErr(error.message); return; }
    setManualReimb((cur) => [data, ...cur]);
    if (!mrPaidNow) setPending((cur) => [...cur, data]);
    if (data.expense_date >= start && data.expense_date < end) setExpenses((cur) => [...cur, data]);
    setMrForm({ tech_id: mrForm.tech_id, expense_date: today(), amount: "", description: "" });
    setMrPaidNow(false);
  }

  async function toggleManualPaid(x) {
    const patch = x.reimbursed
      ? { reimbursed: false, reimbursed_at: null, reimbursed_by: null }
      : { reimbursed: true, reimbursed_at: new Date().toISOString(), reimbursed_by: profile.id };
    setManualReimb((cur) => cur.map((m) => (m.id === x.id ? { ...m, ...patch } : m)));
    setPending((cur) => (!patch.reimbursed ? (cur.some((p) => p.id === x.id) ? cur : [...cur, { ...x, ...patch }]) : cur.filter((p) => p.id !== x.id)));
    await supabase.from("expenses").update(patch).eq("id", x.id);
  }

  async function removeManualReimbursement(x) {
    setManualReimb((cur) => cur.filter((m) => m.id !== x.id));
    setPending((cur) => cur.filter((p) => p.id !== x.id));
    await supabase.from("expenses").delete().eq("id", x.id);
  }

  async function markPaid(x) {
    setPending((cur) => cur.filter((p) => p.id !== x.id));
    const { error } = await supabase.from("expenses").update({ reimbursed: true, reimbursed_at: new Date().toISOString(), reimbursed_by: profile.id }).eq("id", x.id);
    if (error) {
      setPending((cur) => (cur.some((p) => p.id === x.id) ? cur : [...cur, x]));
      alert("Couldn't mark that reimbursement paid: " + error.message);
    }
  }
  async function markPaidTrip(t) {
    setPendingTrips((cur) => cur.filter((p) => p.id !== t.id));
    const { error } = await supabase.from("trips").update({ reimbursed: true, reimbursed_at: new Date().toISOString(), reimbursed_by: profile.id }).eq("id", t.id);
    if (error) {
      setPendingTrips((cur) => (cur.some((p) => p.id === t.id) ? cur : [...cur, t]));
      alert("Couldn't mark that mileage paid: " + error.message);
    }
  }
  const tripAmt = (t) => round2(Number(t.miles) * mileageRate);
  const pendingTotal = round2(pending.reduce((a, x) => a + Number(x.amount), 0) + pendingTrips.reduce((a, t) => a + tripAmt(t), 0));

  // build per-tech, per-week hours so OT is computed weekly even in a 2-week period
  const rows = crew.map((t) => {
    let regHrs = 0, otHrs = 0;
    const weeks = periodLen === 14 ? [start, addDays(start, 7)] : [start];
    for (const ws of weeks) {
      const we = addDays(ws, 7);
      let wkMs = 0;
      for (const s of shifts) {
        if (s.tech_id !== t.id) continue;
        wkMs += overlapMs(s.started_at, s.ended_at, ws, we + "T00:00:00");
      }
      const wkHrs = wkMs / 3600000;
      const reg = Math.min(wkHrs, otThreshold);
      regHrs += reg;
      otHrs += Math.max(0, wkHrs - otThreshold);
    }
    const info = rates[t.id] || { rate: 0, pay_type: "hourly", salary: 0 };
    const rate = info.rate;
    const salaried = info.pay_type === "salary";
    // Reimbursements roll over: count ALL unpaid mileage + purchases (any date),
    // not just this pay period, so they keep adding up until marked paid.
    const miles = round2(pendingTrips.filter((x) => x.tech_id === t.id).reduce((a, x) => a + Number(x.miles), 0));
    const expense = round2(pending.filter((x) => x.tech_id === t.id).reduce((a, x) => a + Number(x.amount), 0));
    // Salaried: pay a fixed share of the annual salary for this period (no OT).
    // Hourly: reg + OT from clocked hours.
    const regPay = salaried ? round2((info.salary / 52) * (periodLen / 7)) : regHrs * rate;
    const otPay = salaried ? 0 : otHrs * rate * otMult;
    const mileagePay = miles * mileageRate;
    return {
      id: t.id, name: t.display_name, rate, salaried, salary: info.salary,
      regHrs: round2(regHrs), otHrs: round2(otHrs), miles, expense,
      regPay: round2(regPay), otPay: round2(otPay), mileagePay: round2(mileagePay),
      gross: round2(regPay + otPay + mileagePay + expense),
    };
  });

  const totals = rows.reduce((a, r) => ({
    regHrs: round2(a.regHrs + r.regHrs), otHrs: round2(a.otHrs + r.otHrs),
    miles: round2(a.miles + r.miles), expense: round2(a.expense + r.expense), gross: round2(a.gross + r.gross),
  }), { regHrs: 0, otHrs: 0, miles: 0, expense: 0, gross: 0 });

  function exportCsv() {
    const head = ["Employee", "Reg hrs", "OT hrs", "Rate", "Reg pay", "OT pay", "Miles", "Mileage pay", "Receipts", "Gross"];
    const lines = rows.map((r) => [r.name, r.regHrs, r.otHrs, r.salaried ? "salary" : r.rate, r.regPay, r.otPay, r.miles, r.mileagePay, r.expense, r.gross].join(","));
    const csv = [`Pay period,${start} to ${addDays(end, -1)}`, "", head.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `payroll_${start}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const money = (n) => `$${n.toFixed(2)}`;
  const nameOf = (id) => crew.find((c) => c.id === id)?.display_name || "—";

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Payroll</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Pay is built from clocked shift hours plus mileage and receipt reimbursement. Overtime is anything past {otThreshold} hrs in a week at {otMult}×. Hours are for the selected period; the <strong>Mileage</strong> and <strong>Receipts</strong> columns show every <strong>unpaid</strong> reimbursement (all dates) and keep rolling forward until you mark them paid below.
      </p>

      <Row style={{ marginTop: 16, alignItems: "flex-end" }}>
        <div><Label>Period start (Mon)</Label><TextInput type="date" value={start} onChange={(e) => setStart(weekStart(e.target.value))} style={{ width: "auto" }} /></div>
        <div>
          <Label>Length</Label>
          <Select value={periodLen} onChange={(e) => setPeriodLen(Number(e.target.value))} style={{ width: 140 }}>
            <option value={7}>1 week</option>
            <option value={14}>2 weeks</option>
          </Select>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={exportCsv} style={btn(C.teal)}>Export CSV</button>
      </Row>
      <div style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginTop: 8 }}>
        {fmtDate(start)} – {fmtDate(addDays(end, -1))}
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: C.slate, fontFamily: BODY, fontSize: 14 }}>Calculating…</div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: BODY, fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr style={{ background: "#F6F8F9", color: C.slate, textAlign: "right" }}>
                {["Employee", "Reg hrs", "OT hrs", "Rate", "Reg pay", "OT pay", "Miles", "Mileage", "Receipts", "Gross"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: i === 0 ? "left" : "right", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${C.line}`, textAlign: "right" }}>
                  <td style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: C.ink }}>{r.name}</td>
                  <td style={{ padding: "8px 10px" }}>{r.regHrs}</td>
                  <td style={{ padding: "8px 10px", color: r.otHrs > 0 ? C.orange : C.slate }}>{r.otHrs}</td>
                  <td style={{ padding: "8px 10px", color: r.salaried ? C.ink : (r.rate ? C.ink : C.red) }}>{r.salaried ? "Salary" : (r.rate ? money(r.rate) : "set rate")}</td>
                  <td style={{ padding: "8px 10px" }}>{money(r.regPay)}</td>
                  <td style={{ padding: "8px 10px" }}>{money(r.otPay)}</td>
                  <td style={{ padding: "8px 10px" }}>{r.miles}</td>
                  <td style={{ padding: "8px 10px" }}>{money(r.mileagePay)}</td>
                  <td style={{ padding: "8px 10px" }}>{money(r.expense)}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: C.green }}>{money(r.gross)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.line}`, textAlign: "right", fontWeight: 700, color: C.ink }}>
                <td style={{ padding: "8px 10px", textAlign: "left" }}>Totals</td>
                <td style={{ padding: "8px 10px" }}>{totals.regHrs}</td>
                <td style={{ padding: "8px 10px" }}>{totals.otHrs}</td>
                <td /><td /><td />
                <td style={{ padding: "8px 10px" }}>{totals.miles}</td>
                <td />
                <td style={{ padding: "8px 10px" }}>{money(totals.expense)}</td>
                <td style={{ padding: "8px 10px", color: C.green }}>{money(totals.gross)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <SectionTitle right={<span style={{ fontSize: 14, fontWeight: 700, color: C.green, fontFamily: BODY }}>{money(pendingTotal)} owed</span>}>Reimbursements to pay out</SectionTitle>
      <p style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 2, marginBottom: 8 }}>
        Pending out-of-pocket expenses and unpaid mileage across all dates. {isOwner ? "Tap Mark paid once you've reimbursed someone — it clears from their reimbursement list." : "Owners can mark these paid."}
      </p>
      {pending.length === 0 && pendingTrips.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing outstanding — everyone's paid up.</div>
      ) : (
        crew.map((t) => {
          const items = pending.filter((x) => x.tech_id === t.id);
          const tripItems = pendingTrips.filter((x) => x.tech_id === t.id);
          if (!items.length && !tripItems.length) return null;
          const sub = round2(items.reduce((a, x) => a + Number(x.amount), 0) + tripItems.reduce((a, x) => a + tripAmt(x), 0));
          return (
            <div key={t.id} style={{ marginBottom: 14 }}>
              <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, color: C.ink }}>{t.display_name}</span>
                <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: C.green }}>{money(sub)}</span>
              </Row>
              <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
                {items.map((x) => {
                  const url = x.receipt_path ? supabase.storage.from("job-media").getPublicUrl(x.receipt_path).data.publicUrl : null;
                  return (
                    <Row key={x.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, flexWrap: "wrap", gap: 8 }}>
                      <span style={{ color: C.slate, minWidth: 70 }}>{fmtDate(x.expense_date)}</span>
                      <span style={{ flex: 1, color: C.ink, minWidth: 120 }}>{x.description}</span>
                      {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: C.teal }}>receipt</a>}
                      <span style={{ fontWeight: 700, color: C.green }}>{money(Number(x.amount))}</span>
                      {isOwner && <button onClick={() => markPaid(x)} style={btnSm(C.teal)}>Mark paid</button>}
                    </Row>
                  );
                })}
                {tripItems.map((x) => (
                  <Row key={x.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, flexWrap: "wrap", gap: 8 }}>
                    <span style={{ color: C.slate, minWidth: 70 }}>{fmtDate(x.trip_date)}</span>
                    <span style={{ flex: 1, color: C.ink, minWidth: 120 }}>{x.purpose || "Mileage"} · {round2(Number(x.miles))} mi @ {money(mileageRate)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999, background: C.orange + "1A", color: C.orange }}>mileage</span>
                    <span style={{ fontWeight: 700, color: C.green }}>{money(tripAmt(x))}</span>
                    {isOwner && <button onClick={() => markPaidTrip(x)} style={btnSm(C.teal)}>Mark paid</button>}
                  </Row>
                ))}
              </div>
            </div>
          );
        })
      )}

      <SectionTitle right={<span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: BODY }}>{money(round2(manualReimb.reduce((a, x) => a + Number(x.amount), 0)))} total</span>}>Manual reimbursements</SectionTitle>
      <p style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 2, marginBottom: 8 }}>
        Reimbursements the owner or manager enters directly — bonuses, cash advances, anything paid outside the normal expense/receipt flow. These count toward gross pay just like a submitted expense.
      </p>
      {mgr && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, background: "#F6F8F9", marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div>
              <Label>Who</Label>
              <Select value={mrForm.tech_id} onChange={(e) => setMrForm({ ...mrForm, tech_id: e.target.value })} style={{ width: "100%" }}>
                {crew.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </Select>
            </div>
            <div><Label>Date</Label><TextInput type="date" value={mrForm.expense_date} onChange={(e) => setMrForm({ ...mrForm, expense_date: e.target.value })} /></div>
            <div><Label>Amount ($)</Label><TextInput type="number" step="0.01" min="0" placeholder="0.00" value={mrForm.amount} onChange={(e) => setMrForm({ ...mrForm, amount: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Label>What is it for?</Label>
            <TextInput placeholder="Tool reimbursement, cash advance, bonus…" value={mrForm.description} onChange={(e) => setMrForm({ ...mrForm, description: e.target.value })} />
          </div>
          <Row style={{ marginTop: 10, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontFamily: BODY, color: C.slate }}>
              <input type="checkbox" checked={mrPaidNow} onChange={(e) => setMrPaidNow(e.target.checked)} />
              Already paid this out
            </label>
            <button onClick={addManualReimbursement} disabled={mrSaving} style={{ ...btn(C.teal), marginLeft: "auto", opacity: mrSaving ? 0.6 : 1 }}>{mrSaving ? "Saving…" : "+ Add reimbursement"}</button>
          </Row>
          {mrErr && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY, marginTop: 8 }}>{mrErr}</div>}
        </div>
      )}
      {manualReimb.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No manual reimbursements yet.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {manualReimb.map((x) => (
            <Row key={x.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, flexWrap: "wrap", gap: 8 }}>
              <span style={{ color: C.slate, minWidth: 70 }}>{fmtDate(x.expense_date)}</span>
              <span style={{ fontWeight: 600, color: C.ink }}>{nameOf(x.tech_id)}</span>
              <span style={{ flex: 1, color: C.ink, minWidth: 120 }}>{x.description}</span>
              <span style={{ fontWeight: 700, color: C.green }}>{money(Number(x.amount))}</span>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999, background: (x.reimbursed ? C.green : C.orange) + "1A", color: x.reimbursed ? C.green : C.orange }}>{x.reimbursed ? "Paid" : "Unpaid"}</span>
              {isOwner && <button onClick={() => toggleManualPaid(x)} style={btnSm(x.reimbursed ? C.slate : C.teal)}>{x.reimbursed ? "Mark unpaid" : "Mark paid"}</button>}
              {mgr && <button onClick={() => removeManualReimbursement(x)} style={{ fontSize: 12, color: C.red }}>remove</button>}
            </Row>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 12 }}>
        This is a gross-pay worksheet for your records and payroll provider — it doesn't calculate tax withholding. Set each person's rate in the Crew screen; overtime rules are in Settings.
      </p>
    </Card>
  );
}
