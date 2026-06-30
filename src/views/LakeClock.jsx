import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, TEST_RESULTS, TEST_COLORS, round2, fmtDate, fmtElapsed } from "../lib/supabase";
import { Card, Row, TextInput, Select, SectionTitle, btn, btnSm, LiveDot } from "../lib/ui";
import { useAuth } from "../AuthContext";

const nameOf = (crew, id) => crew.find((t) => t.id === id)?.display_name || "—";
const skiLabel = (o) => {
  const ski = [o.year, o.make, o.model].filter(Boolean).join(" ");
  return `${o.customer_name}${ski ? " — " + ski : ""}`;
};

export default function LakeClock({ crew, orders, onBack }) {
  const { profile } = useAuth();
  const [orderId, setOrderId] = useState(orders[0]?.id || "");
  const [tech, setTech] = useState(profile.id);
  const [sessions, setSessions] = useState([]);
  const [tests, setTests] = useState([]);
  const [manual, setManual] = useState({ tech_id: profile.id, minutes: "", note: "" });
  const [, tick] = useState(0);

  async function loadSessions() {
    const { data } = await supabase.from("lake_sessions").select("*");
    setSessions(data || []);
  }
  async function loadTests(id) {
    if (!id) { setTests([]); return; }
    const { data } = await supabase.from("lake_tests").select("*").eq("order_id", id).order("test_date");
    setTests(data || []);
  }
  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { loadTests(orderId); }, [orderId]);
  useEffect(() => { if (!orderId && orders.length) setOrderId(orders[0].id); }, [orders]);

  const liveSession = sessions.find((s) => s.order_id === orderId) || null;

  useEffect(() => {
    if (!sessions.length) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [sessions.length]);

  async function startTest() {
    if (!orderId) return;
    const { data, error } = await supabase.from("lake_sessions").insert({ order_id: orderId, tech_id: tech }).select().single();
    if (!error && data) setSessions([...sessions.filter((s) => s.order_id !== orderId), data]);
  }
  async function stopTest() {
    if (!liveSession) return;
    const seconds = Math.round((Date.now() - new Date(liveSession.started_at).getTime()) / 1000);
    const { data } = await supabase.from("lake_tests").insert({ order_id: orderId, tech_id: liveSession.tech_id, seconds }).select().single();
    await supabase.from("lake_sessions").delete().eq("order_id", orderId);
    setSessions(sessions.filter((s) => s.order_id !== orderId));
    if (data) setTests([...tests, data]);
  }
  async function addManual() {
    const min = Number(manual.minutes);
    if (!min || min <= 0 || !orderId) return;
    const { data } = await supabase.from("lake_tests").insert({ order_id: orderId, tech_id: manual.tech_id, seconds: min * 60, note: manual.note.trim() }).select().single();
    if (data) { setTests([...tests, data]); setManual({ ...manual, minutes: "", note: "" }); }
  }
  async function patchRun(id, patch) {
    setTests(tests.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    await supabase.from("lake_tests").update(patch).eq("id", id);
  }

  const totalHrs = round2((tests.reduce((s, r) => s + r.seconds, 0) + (liveSession ? (Date.now() - new Date(liveSession.started_at).getTime()) / 1000 : 0)) / 3600);
  const selected = orders.find((o) => o.id === orderId);

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Lake test clock</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Pick a ski, then run the water timer. Every run you log here also shows up inside that ski's work order under Lake testing.
      </p>

      <SectionTitle>Choose a ski</SectionTitle>
      {orders.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No work orders yet — create one first.</div>
      ) : (
        <Select value={orderId} onChange={(e) => setOrderId(e.target.value)} style={{ width: "100%" }}>
          {orders.map((o) => {
            const running = sessions.some((s) => s.order_id === o.id);
            return (
              <option key={o.id} value={o.id}>
                {running ? "● " : ""}{skiLabel(o)}{o.status === "closed" ? " (closed)" : ""}
              </option>
            );
          })}
        </Select>
      )}

      {orderId && (
        <>
          <SectionTitle right={<span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: BODY }}>{totalHrs} hrs on the water</span>}>
            Lake test timer
          </SectionTitle>
          <div style={{ borderRadius: 6, padding: 12, background: C.water }}>
            {liveSession ? (
              <Row>
                <LiveDot color="#38BDF8" />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: BODY }}>{nameOf(crew, liveSession.tech_id)} is on the water</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>{fmtElapsed(Date.now() - new Date(liveSession.started_at).getTime())}</span>
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

          <SectionTitle>Test runs{selected ? ` · ${skiLabel(selected)}` : ""}</SectionTitle>
          {tests.length === 0 ? (
            <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No test runs yet for this ski.</div>
          ) : (
            <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 8, border: `1px solid ${C.line}` }}>
              {tests.map((r) => (
                <Row key={r.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
                  <span style={{ fontWeight: 600, color: C.ink }}>{nameOf(crew, r.tech_id)}</span>
                  <span style={{ color: C.slate }}>{fmtDate(r.test_date)}</span>
                  <span style={{ fontWeight: 700, color: C.teal }}>{fmtElapsed(r.seconds * 1000)}</span>
                  <button onClick={() => patchRun(r.id, { result: TEST_RESULTS[(TEST_RESULTS.indexOf(r.result) + 1) % TEST_RESULTS.length] })}
                    style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: TEST_COLORS[r.result] + "1A", color: TEST_COLORS[r.result] }}>
                    {r.result}
                  </button>
                  <RunNote value={r.note} onSave={(note) => patchRun(r.id, { note })} />
                  <button onClick={async () => { setTests(tests.filter((x) => x.id !== r.id)); await supabase.from("lake_tests").delete().eq("id", r.id); }} style={{ fontSize: 12, color: C.red }}>remove</button>
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
      )}
    </Card>
  );
}

function RunNote({ value, onSave }) {
  const [v, setV] = useState(value || "");
  return <TextInput value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value || "") && onSave(v)} placeholder="Notes — cavitation gone, 52 mph…" style={{ flex: 1, minWidth: 160 }} />;
}
