import { useState, useEffect, useRef } from "react";
import { supabase, C, DISPLAY, BODY, STAGES, stageOf, PART_STATUSES, PART_COLORS, TEST_RESULTS, TEST_COLORS, today, round2, fmtDate, fmtElapsed } from "../lib/supabase";
import { Card, Row, TextInput, Select, Label, SectionTitle, StatusChip, btn, btnSm, LiveDot, inputStyle } from "../lib/ui";
import { useAuth } from "../AuthContext";

const nameOf = (crew, id) => crew.find((t) => t.id === id)?.display_name || "—";

export default function OrderDetail({ orderId, crew, onBack, canDelete }) {
  const { profile } = useAuth();
  const [order, setOrder] = useState(null);
  const [hours, setHours] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [parts, setParts] = useState([]);
  const [media, setMedia] = useState([]);
  const [lakeTests, setLakeTests] = useState([]);
  const [lakeSession, setLakeSession] = useState(null);
  const [tab, setTab] = useState("job");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, tick] = useState(0);

  async function loadAll() {
    const [o, h, s, p, m, lt, ls] = await Promise.all([
      supabase.from("work_orders").select("*").eq("id", orderId).single(),
      supabase.from("hour_entries").select("*").eq("order_id", orderId).order("work_date"),
      supabase.from("job_sessions").select("*").eq("order_id", orderId),
      supabase.from("parts").select("*").eq("order_id", orderId),
      supabase.from("media").select("*").eq("order_id", orderId).order("created_at"),
      supabase.from("lake_tests").select("*").eq("order_id", orderId).order("test_date"),
      supabase.from("lake_sessions").select("*").eq("order_id", orderId).maybeSingle(),
    ]);
    setOrder(o.data); setHours(h.data || []); setSessions(s.data || []); setParts(p.data || []);
    setMedia(m.data || []); setLakeTests(lt.data || []); setLakeSession(ls.data || null);
  }
  useEffect(() => { loadAll(); }, [orderId]);

  useEffect(() => {
    if (!sessions.length && !lakeSession) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [sessions.length, !!lakeSession]);

  if (!order) return <div style={{ padding: 40, textAlign: "center", color: C.slate, fontFamily: BODY, fontSize: 14 }}>Loading…</div>;

    const patchOrder = async (patch) => {
    const full = { ...patch };
    if ("status" in patch) full.closed_at = patch.status === "closed" ? new Date().toISOString() : null;
    setOrder({ ...order, ...full });
    await supabase.from("work_orders").update(full).eq("id", orderId);
  };
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
            {[order.year, order.make, order.model].filter(Boolean).join(" ")}
            {order.hull_id && ` · Hull ${order.hull_id}`}{order.customer_phone && ` · ${order.customer_phone}`}
          </div>
        </div>
        <StatusChip status={order.status} big />
      </Row>
      <p style={{ marginTop: 12, fontSize: 14, borderRadius: 6, padding: 12, background: "#F6F8F9", color: C.ink, fontFamily: BODY, border: `1px solid ${C.line}` }}>{order.issue}</p>

      {/* tabs */}
      <div style={{ display: "flex", gap: 4, marginTop: 16, borderBottom: `2px solid ${C.line}` }}>
        {[{ key: "job", label: "Job" }, { key: "lake", label: `Lake testing${lakeTests.length ? ` (${lakeTests.length})` : ""}` }].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
            padding: "8px 14px", borderRadius: "6px 6px 0 0",
            background: tab === t.key ? C.ink : "transparent", color: tab === t.key ? "#fff" : C.slate,
          }}>
            {t.label}{t.key === "lake" && lakeSession && <span style={{ marginLeft: 6 }}><LiveDot color="#38BDF8" /></span>}
          </button>
        ))}
      </div>

      {tab === "job" ? (
        <JobTab {...{ order, crew, profile, hours, setHours, sessions, setSessions, parts, setParts, media, setMedia, patchOrder, totalHrs, orderId }} />
      ) : (
        <LakeTab {...{ orderId, crew, profile, lakeTests, setLakeTests, lakeSession, setLakeSession }} />
      )}
    </Card>
  );
}

/* ================= JOB TAB ================= */
function JobTab({ order, crew, profile, hours, setHours, sessions, setSessions, parts, setParts, media, setMedia, patchOrder, totalHrs, orderId }) {
  const [hourForm, setHourForm] = useState({ tech_id: profile.id, work_date: today(), hours: "", note: "" });
  const [partForm, setPartForm] = useState({ name: "", qty: "1", note: "" });
  const [clockTech, setClockTech] = useState(profile.id);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const fileRef = useRef(null);

  const publicUrl = (path) => supabase.storage.from("job-media").getPublicUrl(path).data.publicUrl;

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
    const { data } = await supabase.from("parts").insert({ order_id: orderId, name: partForm.name.trim(), qty: Number(partForm.qty) || 1, note: partForm.note.trim() }).select().single();
    if (data) { setParts([...parts, data]); setPartForm({ name: "", qty: "1", note: "" }); }
  }
  async function cyclePart(p) {
    const status = PART_STATUSES[(PART_STATUSES.indexOf(p.status) + 1) % PART_STATUSES.length];
    setParts(parts.map((x) => (x.id === p.id ? { ...x, status } : x)));
    await supabase.from("parts").update({ status }).eq("id", p.id);
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
        const { data } = await supabase.from("media").insert({ order_id: orderId, path, kind, name: file.name }).select().single();
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

      <SectionTitle>Assigned technician</SectionTitle>
      <Row>
        {crew.map((t) => (
          <button key={t.id} onClick={() => patchOrder({ assigned_to: order.assigned_to === t.id ? null : t.id })} style={{
            fontFamily: BODY, fontSize: 14, fontWeight: 600, padding: "6px 14px", borderRadius: 999,
            background: order.assigned_to === t.id ? C.teal : C.paleTeal, color: order.assigned_to === t.id ? "#fff" : C.teal,
          }}>{t.display_name}</button>
        ))}
      </Row>

      <SectionTitle right={<span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: BODY }}>{totalHrs} hrs total</span>}>Hour log</SectionTitle>
      {hours.length > 0 && (
        <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 8, border: `1px solid ${C.line}` }}>
          {hours.map((h) => (
            <Row key={h.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ fontWeight: 600, color: C.ink }}>{nameOf(crew, h.tech_id)}</span>
              <span style={{ color: C.slate }}>{fmtDate(h.work_date)}</span>
              <span style={{ fontWeight: 700, color: h.clocked ? C.orange : C.teal }}>{h.hours} hrs</span>
              <span style={{ flex: 1, color: C.slate }}>{h.note}</span>
              <button onClick={async () => { setHours(hours.filter((x) => x.id !== h.id)); await supabase.from("hour_entries").delete().eq("id", h.id); }} style={{ fontSize: 12, color: C.red }}>remove</button>
            </Row>
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
        <button onClick={addHours} style={btn(C.teal)}>Log hours</button>
      </Row>

      <SectionTitle>Parts requests</SectionTitle>
      {parts.length > 0 && (
        <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 8, border: `1px solid ${C.line}` }}>
          {parts.map((p) => (
            <Row key={p.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
              <span style={{ fontWeight: 600, color: C.ink }}>{p.qty}× {p.name}</span>
              <span style={{ flex: 1, color: C.slate }}>{p.note}</span>
              <button onClick={() => cyclePart(p)} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999, background: PART_COLORS[p.status] + "1A", color: PART_COLORS[p.status] }}>{p.status}</button>
              <button onClick={async () => { setParts(parts.filter((x) => x.id !== p.id)); await supabase.from("parts").delete().eq("id", p.id); }} style={{ fontSize: 12, color: C.red }}>remove</button>
            </Row>
          ))}
        </div>
      )}
      <Row>
        <TextInput placeholder="Part — Starter relay 278003012" value={partForm.name} onChange={(e) => setPartForm({ ...partForm, name: e.target.value })} style={{ flex: 2, minWidth: 180 }} />
        <TextInput type="number" min="1" value={partForm.qty} onChange={(e) => setPartForm({ ...partForm, qty: e.target.value })} style={{ width: 70 }} />
        <TextInput placeholder="Note / supplier" value={partForm.note} onChange={(e) => setPartForm({ ...partForm, note: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <button onClick={addPart} style={btn(C.teal)}>Request part</button>
      </Row>

      <SectionTitle right={
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={btnSm(C.orange)}>{uploading ? "Uploading…" : "+ Add photos / video"}</button>
      }>Photos & video</SectionTitle>
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={uploadFiles} />
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

function RunNote({ value, onSave }) {
  const [v, setV] = useState(value || "");
  return <TextInput value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value || "") && onSave(v)} placeholder="Notes — cavitation gone, 52 mph…" style={{ flex: 1, minWidth: 160 }} />;
}
