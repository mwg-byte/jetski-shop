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
  const [notes, setNotes] = useState([]);
  const [media, setMedia] = useState([]);
  const [lakeTests, setLakeTests] = useState([]);
  const [lakeSession, setLakeSession] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [tab, setTab] = useState("job");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, tick] = useState(0);

  async function loadAll() {
    const [o, h, s, p, m, lt, ls, oa, no] = await Promise.all([
      supabase.from("work_orders").select("*").eq("id", orderId).single(),
      supabase.from("hour_entries").select("*").eq("order_id", orderId).order("work_date"),
      supabase.from("job_sessions").select("*").eq("order_id", orderId),
      supabase.from("parts").select("*").eq("order_id", orderId),
      supabase.from("media").select("*").eq("order_id", orderId).order("created_at"),
      supabase.from("lake_tests").select("*").eq("order_id", orderId).order("test_date"),
      supabase.from("lake_sessions").select("*").eq("order_id", orderId).maybeSingle(),
      supabase.from("order_assignees").select("tech_id").eq("order_id", orderId),
      supabase.from("order_notes").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    ]);
    setOrder(o.data); setHours(h.data || []); setSessions(s.data || []); setParts(p.data || []);
    setMedia(m.data || []); setLakeTests(lt.data || []); setLakeSession(ls.data || null);
    setAssignees((oa.data || []).map((r) => r.tech_id));
    setNotes(no.data || []);
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
      {order.kind === "maintenance" && (
        <span style={{ display: "inline-block", marginTop: 8, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 999, background: "#A162071A", color: "#A16207" }}>Maintenance task</span>
      )}
      {order.status === "ready" && order.customer_phone && (
        <div style={{ marginTop: 12 }}>
          <a href={`sms:${order.customer_phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(`Hi ${order.customer_name}, your ${[order.year, order.make, order.model].filter(Boolean).join(" ") || "ski"} is ready for pickup! Give us a call or stop by whenever you're ready. Thanks!`)}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 8, background: C.green, color: "#fff", fontFamily: BODY, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
            Text customer — ready for pickup
          </a>
          <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 4 }}>Opens Messages with a pre-written note to {order.customer_phone}. Review it, then hit send.</div>
        </div>
      )}
      <p style={{ marginTop: 12, fontSize: 14, borderRadius: 6, padding: 12, background: "#F6F8F9", color: C.ink, fontFamily: BODY, border: `1px solid ${C.line}` }}>{order.issue}</p>

      {/* tabs */}
      <div style={{ display: "flex", gap: 4, marginTop: 16, borderBottom: `2px solid ${C.line}` }}>
        {(order.kind === "maintenance" ? [{ key: "job", label: "Job" }] : [{ key: "job", label: "Job" }, { key: "lake", label: `Lake testing${lakeTests.length ? ` (${lakeTests.length})` : ""}` }]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
            padding: "8px 14px", borderRadius: "6px 6px 0 0",
            background: tab === t.key ? C.ink : "transparent", color: tab === t.key ? "#fff" : C.slate,
          }}>
            {t.label}{t.key === "lake" && lakeSession && <span style={{ marginLeft: 6 }}><LiveDot color="#38BDF8" /></span>}
          </button>
        ))}
      </div>

      {tab === "job" || order.kind === "maintenance" ? (
        <JobTab {...{ order, crew, profile, hours, setHours, sessions, setSessions, parts, setParts, notes, setNotes, media, setMedia, patchOrder, totalHrs, orderId, assignees, setAssignees, isMgr: canDelete }} />
      ) : (
        <LakeTab {...{ orderId, crew, profile, lakeTests, setLakeTests, lakeSession, setLakeSession }} />
      )}
    </Card>
  );
}

/* ================= JOB TAB ================= */
function JobTab({ order, crew, profile, hours, setHours, sessions, setSessions, parts, setParts, notes, setNotes, media, setMedia, patchOrder, totalHrs, orderId, assignees, setAssignees, isMgr }) {
  const [hourForm, setHourForm] = useState({ tech_id: profile.id, work_date: today(), hours: "", note: "" });
  const [partForm, setPartForm] = useState({ name: "", qty: "1", note: "" });
  const [takenForm, setTakenForm] = useState({ name: "", qty: "1", note: "" });
  const [noteText, setNoteText] = useState("");
  const [editHourId, setEditHourId] = useState(null);
  const [editHourVals, setEditHourVals] = useState({ hours: "", work_date: "" });
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
    const { data } = await supabase.from("parts").insert({ order_id: orderId, name: partForm.name.trim(), qty: Number(partForm.qty) || 1, note: partForm.note.trim(), kind: "request" }).select().single();
    if (data) { setParts([...parts, data]); setPartForm({ name: "", qty: "1", note: "" }); }
  }
  async function addTaken() {
    if (!takenForm.name.trim()) return;
    const { data } = await supabase.from("parts").insert({ order_id: orderId, name: takenForm.name.trim(), qty: Number(takenForm.qty) || 1, note: takenForm.note.trim(), kind: "taken" }).select().single();
    if (data) { setParts([...parts, data]); setTakenForm({ name: "", qty: "1", note: "" }); }
  }
  async function addNote() {
    const body = noteText.trim();
    if (!body) return;
    const { data } = await supabase.from("order_notes").insert({ order_id: orderId, author_id: profile.id, body }).select().single();
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

  const requests = parts.filter((p) => (p.kind || "request") === "request");
  const taken = parts.filter((p) => p.kind === "taken");

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
        <div style
