import { useState, useEffect, useRef } from "react";
import { supabase, C, DISPLAY, BODY, today, round2, fmtDate, isManager } from "../lib/supabase";
import { Card, Row, TextInput, Select, Label, SectionTitle, btn, btnSm } from "../lib/ui";
import { useAuth } from "../AuthContext";
import { RANGES, inRange } from "./ShiftClock";

const money = (n) => `$${Number(n).toFixed(2)}`;

export default function Reimbursement({ crew, onBack }) {
  const { profile } = useAuth();
  const mgr = isManager(profile.role);
  const [expenses, setExpenses] = useState([]);
  const [range, setRange] = useState("all");
  const [form, setForm] = useState({ tech_id: profile.id, expense_date: today(), amount: "", description: "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const nameOf = (id) => crew.find((c) => c.id === id)?.display_name || "—";
  const publicUrl = (path) => (path ? supabase.storage.from("job-media").getPublicUrl(path).data.publicUrl : null);

  async function load() {
    let q = supabase.from("expenses").select("*").order("expense_date", { ascending: false });
    if (!mgr) q = q.eq("tech_id", profile.id);
    const { data } = await q;
    setExpenses(data || []);
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { setErr("Enter an amount greater than 0."); return; }
    if (!form.description.trim()) { setErr("Add a short note for what this is for."); return; }
    setSaving(true); setErr("");
    let receipt_path = "";
    try {
      if (file) {
        const path = `receipts/${form.tech_id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("job-media").upload(path, file);
        if (upErr) throw upErr;
        receipt_path = path;
      }
      const { data, error } = await supabase.from("expenses").insert({
        tech_id: form.tech_id, expense_date: form.expense_date, amount: amt,
        description: form.description.trim(), receipt_path,
      }).select().single();
      if (error) throw error;
      setExpenses([data, ...expenses]);
      setForm({ ...form, amount: "", description: "" });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setErr(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(x) {
    setExpenses(expenses.filter((e) => e.id !== x.id));
    if (x.receipt_path) await supabase.storage.from("job-media").remove([x.receipt_path]);
    await supabase.from("expenses").delete().eq("id", x.id);
  }

  const rows = expenses.filter((x) => inRange(x.expense_date, range));
  const total = round2(rows.reduce((a, x) => a + Number(x.amount), 0));

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Reimbursement</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Submit out-of-pocket expenses — parts runs, dump fees, supplies. Add what it was for, the amount, and a photo of the receipt. Totals flow into Payroll and Reports.
      </p>

      <SectionTitle>Submit an expense</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {mgr && (
          <div>
            <Label>Who</Label>
            <Select value={form.tech_id} onChange={(e) => setForm({ ...form, tech_id: e.target.value })} style={{ width: "100%" }}>
              {crew.map((c) => <option key={c.id} value={c.id}>{c.display_name}{c.id === profile.id ? " (me)" : ""}</option>)}
            </Select>
          </div>
        )}
        <div><Label>Date</Label><TextInput type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
        <div><Label>Amount ($)</Label><TextInput type="number" step="0.01" min="0" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Label>What is it for?</Label>
        <TextInput placeholder="Dump fees, oil filter run, shop supplies…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <Row style={{ marginTop: 12 }}>
        <button onClick={() => fileRef.current?.click()} style={btnSm(C.orange)}>{file ? "Change receipt photo" : "+ Add receipt photo"}</button>
        {file && <span style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>{file.name}</span>}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button onClick={submit} disabled={saving} style={{ ...btn(C.teal), marginLeft: "auto", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Submit"}</button>
      </Row>
      {err && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY, marginTop: 8 }}>{err}</div>}

      <SectionTitle right={
        <Row style={{ gap: 4 }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: range === r.key ? C.teal : "#F1F4F6", color: range === r.key ? "#fff" : C.slate }}>{r.label}</button>
          ))}
        </Row>
      }>{mgr ? "All expenses" : "My expenses"} · {money(total)}</SectionTitle>

      {rows.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No expenses in this range.</div>
      ) : (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
          {rows.map((x) => {
            const url = publicUrl(x.receipt_path);
            const canRemove = mgr || x.tech_id === profile.id;
            return (
              <Row key={x.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
                <span style={{ color: C.slate, minWidth: 70 }}>{fmtDate(x.expense_date)}</span>
                {mgr && <span style={{ fontWeight: 600, color: C.ink }}>{nameOf(x.tech_id)}</span>}
                <span style={{ flex: 1, color: C.ink }}>{x.description}</span>
                {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: C.teal }}>receipt</a>}
                <span style={{ fontWeight: 700, color: C.green }}>{money(x.amount)}</span>
                {canRemove && <button onClick={() => remove(x)} style={{ fontSize: 12, color: C.red }}>remove</button>}
              </Row>
            );
          })}
        </div>
      )}
    </Card>
  );
}