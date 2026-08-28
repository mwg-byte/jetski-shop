import { useState, useMemo, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, today, stageOf } from "../lib/supabase";
import { Card, Row, SectionTitle, TextInput, StatusChip, btn, btnSm } from "../lib/ui";
import { useAuth } from "../AuthContext";

const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");
const skiText = (o) => [o.year, o.make, o.model].filter(Boolean).join(" ");
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Build a 6-row (42 cell) grid of ISO dates for the month containing `anchor`.
function monthGrid(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setDate(first.getDate() - startOffset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}
const isoOf = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function Calendar({ orders = [], assignees = {}, mgr, crew = [], onAssigneesChange, onOpen, onBack }) {
  const { profile } = useAuth();
  const [anchor, setAnchor] = useState(() => new Date());
  const [scope, setScope] = useState("mine"); // "mine" | "all"
  const [dayModal, setDayModal] = useState(null); // ISO date of the day being edited
  const [dirty, setDirty] = useState(false); // assignees changed — refresh parent on close

  // local copy so the grid updates the moment a date is set
  const [items, setItems] = useState(orders);
  useEffect(() => { setItems(orders); }, [orders]);
  // local assignees so tech chips update instantly
  const [asg, setAsg] = useState(assignees);
  useEffect(() => { setAsg(assignees); }, [assignees]);

  async function schedule(id, date) {
    setItems((list) => list.map((o) => (o.id === id ? { ...o, scheduled_date: date } : o)));
    await supabase.from("work_orders").update({ scheduled_date: date }).eq("id", id);
  }
  async function toggleTech(orderId, techId) {
    const cur = asg[orderId] || [];
    const has = cur.includes(techId);
    const next = has ? cur.filter((x) => x !== techId) : [...cur, techId];
    setAsg((a) => ({ ...a, [orderId]: next }));
    setDirty(true);
    if (has) await supabase.from("order_assignees").delete().eq("order_id", orderId).eq("tech_id", techId);
    else await supabase.from("order_assignees").insert({ order_id: orderId, tech_id: techId });
  }
  function closeDay() {
    setDayModal(null);
    if (dirty && onAssigneesChange) { onAssigneesChange(); setDirty(false); }
  }

  // jobs with a scheduled date that aren't closed
  const scheduled = useMemo(
    () => items.filter((o) => o.scheduled_date && o.status !== "closed"),
    [items]
  );
  const mineOnly = useMemo(
    () => scheduled.filter((o) => (assignees[o.id] || []).includes(profile.id)),
    [scheduled, assignees, profile.id]
  );
  const unscheduled = useMemo(
    () => items.filter((o) => !o.scheduled_date && o.status !== "closed"),
    [items]
  );
  const shown = scope === "mine" ? mineOnly : scheduled;

  // index jobs by ISO date
  const byDate = useMemo(() => {
    const m = {};
    shown.forEach((o) => {
      const k = dateOnly(o.scheduled_date);
      (m[k] = m[k] || []).push(o);
    });
    return m;
  }, [shown]);

  const cells = useMemo(() => monthGrid(anchor), [anchor]);
  const todayIso = today();
  const monthIdx = anchor.getMonth();

  const feedUrl = profile.calendar_token
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed?token=${profile.calendar_token}`
    : null;

  const step = (n) => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + n, 1));

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Calendar</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Scheduled jobs by day. Toggle between the work assigned to you and the whole shop, and subscribe on your phone to see your jobs on your home screen.
      </p>

      {/* controls */}
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        <Row style={{ gap: 6 }}>
          <button onClick={() => step(-1)} style={navBtn}>‹</button>
          <button onClick={() => setAnchor(new Date())} style={{ ...navBtn, width: "auto", padding: "0 14px", fontFamily: BODY, fontSize: 13, fontWeight: 600 }}>Today</button>
          <button onClick={() => step(1)} style={navBtn}>›</button>
          <span style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color: C.ink, textTransform: "uppercase", marginLeft: 8 }}>
            {MONTHS[monthIdx]} {anchor.getFullYear()}
          </span>
        </Row>
        <div style={{ display: "flex", background: "#F1F4F6", borderRadius: 999, padding: 3 }}>
          {[["mine", "Mine"], ["all", "Whole shop"]].map(([key, label]) => {
            const active = scope === key;
            return (
              <button key={key} onClick={() => setScope(key)} style={{
                fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 999,
                background: active ? C.ink : "transparent", color: active ? "#fff" : C.slate,
              }}>{label}{key === "mine" ? ` · ${mineOnly.length}` : ""}</button>
            );
          })}
        </div>
      </Row>

      {/* weekday header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 12 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.slate, fontFamily: BODY, textAlign: "center", padding: "4px 0" }}>{w}</div>
        ))}
      </div>

      {/* month grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((d) => {
          const iso = isoOf(d);
          const inMonth = d.getMonth() === monthIdx;
          const isToday = iso === todayIso;
          const jobs = byDate[iso] || [];
          return (
            <div key={iso} onClick={mgr ? () => { setDayModal(iso); } : undefined} style={{
              minHeight: 96, borderRadius: 6, border: `1px solid ${isToday ? C.orange : C.line}`,
              background: inMonth ? C.card : "#F6F8F9", padding: 5, display: "flex", flexDirection: "column", gap: 3,
              opacity: inMonth ? 1 : 0.55, cursor: mgr ? "pointer" : "default",
            }}>
              <div style={{
                fontSize: 12, fontWeight: isToday ? 700 : 600, fontFamily: BODY,
                color: isToday ? C.orange : inMonth ? C.ink : C.slate, textAlign: "right", padding: "0 2px",
              }}>{d.getDate()}</div>
              {jobs.map((o) => {
                const stg = stageOf(o.status);
                const maint = o.kind === "maintenance";
                return (
                  <button key={o.id} onClick={(e) => { e.stopPropagation(); onOpen(o.id); }} title={`${o.customer_name} — ${stg.label}`} style={{
                    textAlign: "left", borderRadius: 4, padding: "3px 6px", fontFamily: BODY, fontSize: 11, fontWeight: 600,
                    lineHeight: 1.25, color: "#fff", background: maint ? "#A16207" : stg.color,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {o.customer_name}{o.est_hours ? ` · ${o.est_hours}h` : ""}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div style={{ fontSize: 11, color: C.slate, fontFamily: BODY, marginTop: 12 }}>
        Colors follow each job's status. <span style={{ color: "#A16207", fontWeight: 700 }}>Amber</span> = maintenance task. Tap a job to open it{mgr ? ", or tap any day to schedule jobs and assign techs" : ""}.
      </div>

      {/* add jobs to the calendar (managers) */}
      {mgr && (
        <div style={{ marginTop: 20, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
          <SectionTitle>Add jobs to the calendar{unscheduled.length ? ` · ${unscheduled.length} unscheduled` : ""}</SectionTitle>
          <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginTop: 4 }}>
            Pick a date to drop an open job onto the calendar. It shows up on the grid right away and on the assigned crew member's phone feed.
          </p>
          {unscheduled.length === 0 ? (
            <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY, padding: "12px 0" }}>Every open job has a date. Nice.</div>
          ) : (
            <div style={{ borderRadius: 8, border: `1px solid ${C.line}`, overflow: "hidden", marginTop: 8 }}>
              {unscheduled.map((o) => (
                <Row key={o.id} style={{ justifyContent: "space-between", padding: "8px 12px", borderTop: `1px solid ${C.line}`, gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => onOpen(o.id)} style={{ textAlign: "left", fontFamily: BODY }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: C.ink }}>
                      {o.customer_name}
                      {o.kind === "maintenance" && <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 999, background: "#A162071A", color: "#A16207", marginLeft: 8 }}>Maintenance</span>}
                    </div>
                    <div style={{ fontSize: 12, color: C.slate }}>{skiText(o) || o.issue || "—"}</div>
                  </button>
                  <Row style={{ gap: 10 }}>
                    <StatusChip status={o.status} />
                    <TextInput type="date" value="" onChange={(e) => e.target.value && schedule(o.id, e.target.value)} style={{ width: "auto", padding: "6px 8px" }} />
                  </Row>
                </Row>
              ))}
            </div>
          )}
        </div>
      )}

      {/* subscribe on your phone */}
      <div style={{ marginTop: 20, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
        <SectionTitle>Subscribe on your phone</SectionTitle>
        {feedUrl ? (
          <>
            <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginTop: 4 }}>
              This private link adds <strong>your assigned jobs</strong> to your phone's calendar and keeps them updated automatically. It's just for you — don't share it.
            </p>
            <Row style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <input readOnly value={feedUrl} onFocus={(e) => e.target.select()} style={{
                flex: 1, minWidth: 220, fontFamily: BODY, fontSize: 12, color: C.ink, padding: "8px 10px",
                border: `1px solid ${C.line}`, borderRadius: 6, background: "#F6F8F9",
              }} />
              <button onClick={() => { navigator.clipboard?.writeText(feedUrl); }} style={{
                fontFamily: BODY, fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 6, background: C.teal, color: "#fff",
              }}>Copy link</button>
            </Row>
            <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 10, lineHeight: 1.6 }}>
              <div><strong>iPhone:</strong> Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar → paste the link.</div>
              <div><strong>Android / Google Calendar:</strong> open calendar.google.com on a computer → Other calendars → From URL → paste the link.</div>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginTop: 4 }}>
            Your personal calendar link isn't set up yet. Once the calendar feed is deployed, it will appear here.
          </p>
        )}
      </div>

      {/* day editor modal */}
      {dayModal && (() => {
        const dd = new Date(dayModal + "T12:00:00");
        const dayLabel = dd.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
        const onDay = items.filter((o) => dateOnly(o.scheduled_date) === dayModal && o.status !== "closed");
        const toAdd = items.filter((o) => !o.scheduled_date && o.status !== "closed");
        const techChip = (o, t) => {
          const on = (asg[o.id] || []).includes(t.id);
          return (
            <button key={t.id} onClick={() => toggleTech(o.id, t.id)} style={{
              fontFamily: BODY, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
              background: on ? C.teal : "#F1F4F6", color: on ? "#fff" : C.slate,
            }}>{on ? "✓ " : ""}{t.display_name}</button>
          );
        };
        return (
          <div onClick={closeDay} style={{ position: "fixed", inset: 0, background: "rgba(12,34,51,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 50, overflowY: "auto" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, maxWidth: 540, width: "100%", padding: 18, marginTop: 30, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, textTransform: "uppercase", color: C.ink }}>{dayLabel}</h3>
                <button onClick={closeDay} style={{ fontSize: 20, color: C.slate, fontWeight: 700, lineHeight: 1 }}>✕</button>
              </Row>

              <SectionTitle>Scheduled ({onDay.length})</SectionTitle>
              {onDay.length === 0 ? (
                <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing scheduled this day yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {onDay.map((o) => (
                    <div key={o.id} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10 }}>
                      <Row style={{ justifyContent: "space-between", gap: 8 }}>
                        <button onClick={() => { closeDay(); onOpen(o.id); }} style={{ textAlign: "left", fontFamily: BODY }}>
                          <span style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: C.ink }}>{o.customer_name}</span>
                          <span style={{ fontSize: 13, color: C.slate, marginLeft: 8 }}>{skiText(o) || (o.kind === "maintenance" ? "Maintenance" : "—")}</span>
                        </button>
                        <button onClick={() => schedule(o.id, null)} style={{ fontSize: 12, fontWeight: 600, color: C.red, fontFamily: BODY }}>Unschedule</button>
                      </Row>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.slate, fontFamily: BODY, margin: "8px 0 4px" }}>Assigned techs</div>
                      <Row style={{ gap: 6 }}>{crew.map((t) => techChip(o, t))}</Row>
                    </div>
                  ))}
                </div>
              )}

              <SectionTitle>Add a job to this day ({toAdd.length})</SectionTitle>
              {toAdd.length === 0 ? (
                <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Every open job already has a date.</div>
              ) : (
                <div style={{ borderRadius: 8, border: `1px solid ${C.line}`, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
                  {toAdd.map((o) => (
                    <Row key={o.id} style={{ justifyContent: "space-between", padding: "8px 10px", borderTop: `1px solid ${C.line}`, gap: 8 }}>
                      <button onClick={() => { closeDay(); onOpen(o.id); }} style={{ textAlign: "left", fontFamily: BODY, flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: C.ink }}>{o.customer_name}</span>
                        <span style={{ fontSize: 12, color: C.slate, marginLeft: 6 }}>{skiText(o) || (o.kind === "maintenance" ? "Maintenance" : o.issue || "—")}</span>
                      </button>
                      <button onClick={() => schedule(o.id, dayModal)} style={btnSm(C.orange)}>Add</button>
                    </Row>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </Card>
  );
}

const navBtn = {
  width: 34, height: 34, borderRadius: 6, border: `1px solid ${C.line}`, background: "#fff",
  color: C.ink, fontSize: 18, fontWeight: 700, fontFamily: BODY, lineHeight: 1,
};
