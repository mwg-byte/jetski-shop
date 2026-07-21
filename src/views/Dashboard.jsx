import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, fmtDate, today } from "../lib/supabase";
import { Card, Row, TextInput, Select, SectionTitle, StatusChip, btn } from "../lib/ui";
import { useAuth } from "../AuthContext";

export default function Dashboard({ crew, orders, assignees = {}, mgr, settings, onUnread, onOpen }) {
  const { profile } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [sentMsgs, setSentMsgs] = useState([]);
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState("");
  const [replyTo, setReplyTo] = useState(null); // message id currently being replied to
  const [replyText, setReplyText] = useState("");
  const [replyErr, setReplyErr] = useState("");
  const [orderNotes, setOrderNotes] = useState([]);

  const nameOf = (id) => crew.find((c) => c.id === id)?.display_name || "Someone";

  async function loadMsgs() {
    const { data } = await supabase.from("dashboard_messages").select("*").eq("recipient_id", profile.id).order("created_at", { ascending: false });
    setMsgs(data || []);
  }
  async function loadSent() {
    // loaded for everyone (not just managers) so replies can thread under messages
    const { data } = await supabase.from("dashboard_messages").select("*").eq("sender_id", profile.id).order("created_at", { ascending: false });
    setSentMsgs(data || []);
  }
  useEffect(() => { loadMsgs(); loadSent(); }, []);

  // replies keyed by the message they answer (merge everything I can see, dedup)
  const repliesByParent = (() => {
    const map = {}; const seen = new Set();
    [...msgs, ...sentMsgs].forEach((m) => {
      if (!m.parent_id || seen.has(m.id)) return;
      seen.add(m.id);
      (map[m.parent_id] = map[m.parent_id] || []).push(m);
    });
    Object.values(map).forEach((a) => a.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at))));
    return map;
  })();

  const inboxTop = msgs.filter((m) => !m.parent_id);       // top-level messages sent to me
  const unreadCount = msgs.filter((m) => !m.read).length;   // includes replies to me
  useEffect(() => { onUnread?.(unreadCount); }, [unreadCount]);

  async function sendReply(parent) {
    if (!replyText.trim()) return;
    setReplyErr("");
    const { error } = await supabase.from("dashboard_messages").insert({
      recipient_id: parent.sender_id, sender_id: profile.id, body: replyText.trim(), parent_id: parent.id,
    });
    if (error) { setReplyErr("Couldn't send reply — try again."); return; }
    setReplyText(""); setReplyTo(null);
    loadMsgs(); loadSent();
  }

  const myOrders = orders.filter((o) => (assignees[o.id] || []).includes(profile.id) && o.status !== "closed");

  const isInvoicer = !!settings?.invoicer_id && settings.invoicer_id === profile.id;
  const readyForInvoice = orders.filter((o) => o.status === "ready_for_invoice");

  const isWatcher = !!settings?.notes_watcher_id && settings.notes_watcher_id === profile.id;
  useEffect(() => {
    if (!isWatcher) return;
    supabase.from("order_notes").select("*").order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setOrderNotes(data || []));
  }, [isWatcher]);
  const orderById = {};
  orders.forEach((o) => { orderById[o.id] = o; });
  const notesFeed = orderNotes
    .map((n) => ({ ...n, order: orderById[n.order_id] }))
    .filter((n) => n.order && n.order.status !== "closed");

  const todayStr = today();
  const dOf = (o) => (o.scheduled_date ? String(o.scheduled_date).slice(0, 10) : "");
  const openSched = orders.filter((o) => o.status !== "closed" && dOf(o));
  const todays = openSched.filter((o) => dOf(o) === todayStr);
  const overdue = openSched.filter((o) => dOf(o) < todayStr).sort((a, b) => dOf(a).localeCompare(dOf(b)));
  const upcoming = openSched.filter((o) => dOf(o) > todayStr).sort((a, b) => dOf(a).localeCompare(dOf(b)));
  const schedRow = (o, showDate) => (
    <button key={o.id} onClick={() => onOpen(o.id)} style={{ textAlign: "left", border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px", background: C.card }}>
      <Row style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <span style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: C.ink }}>{o.customer_name}</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 13, color: C.slate, marginLeft: 8 }}>{[o.year, o.make, o.model].filter(Boolean).join(" ")}</span>
        </div>
        <Row style={{ gap: 8 }}>
          {showDate && <span style={{ fontSize: 12, fontWeight: 700, color: C.red, fontFamily: BODY }}>{fmtDate(dOf(o))}</span>}
          {o.est_hours ? <span style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>{o.est_hours}h</span> : null}
          <StatusChip status={o.status} />
        </Row>
      </Row>
    </button>
  );

  async function send() {
    if (!body.trim() || !to) return;
    const recipients = to === "all" ? crew.map((c) => c.id) : [to];
    const rows = recipients.map((rid) => ({ recipient_id: rid, sender_id: profile.id, body: body.trim() }));
    setSent("Sending…");
    const { error } = await supabase.from("dashboard_messages").insert(rows);
    if (error) { setSent("Couldn't send — try again"); return; }
    setBody(""); setTo(""); setSent("Sent ✓");
    loadMsgs(); loadSent();
    setTimeout(() => setSent(""), 2500);
  }
  async function setRead(m, read) {
    setMsgs(msgs.map((x) => (x.id === m.id ? { ...x, read } : x)));
    await supabase.from("dashboard_messages").update({ read }).eq("id", m.id);
  }
  async function markAllRead() {
    const ids = msgs.filter((m) => !m.read).map((m) => m.id);
    if (!ids.length) return;
    setMsgs(msgs.map((x) => ({ ...x, read: true })));
    await supabase.from("dashboard_messages").update({ read: true }).in("id", ids);
  }
  async function remove(m) {
    setMsgs(msgs.filter((x) => x.id !== m.id));
    await supabase.from("dashboard_messages").delete().eq("id", m.id);
  }
  async function removeBatch(b) {
    setSentMsgs(sentMsgs.filter((x) => !b.ids.includes(x.id)));
    await supabase.from("dashboard_messages").delete().in("id", b.ids);
  }
  const sentBatches = (() => {
    const map = new Map();
    for (const m of sentMsgs) {
      const key = `${m.created_at}|${m.body}`;
      if (!map.has(key)) map.set(key, { key, body: m.body, created_at: m.created_at, ids: [], recipients: [], readCount: 0 });
      const b = map.get(key);
      b.ids.push(m.id); b.recipients.push(m.recipient_id); if (m.read) b.readCount++;
    }
    return [...map.values()];
  })();
  const recipLabel = (b) => b.recipients.length === 1 ? nameOf(b.recipients[0]) : (b.recipients.length >= crew.length ? "Everyone" : `${b.recipients.length} people`);

  return (
    <>
      <Card>
        <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink }}>
          Hi, {profile.display_name?.split(" ")[0] || "there"}
        </h2>
        <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>Your messages and what you're assigned to.</p>
      </Card>

      {isInvoicer && (
        <Card style={{ marginTop: 12 }}>
          <SectionTitle>Ready for invoice{readyForInvoice.length ? ` · ${readyForInvoice.length}` : ""}</SectionTitle>
          {readyForInvoice.length === 0 ? (
            <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing waiting to be invoiced right now.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {readyForInvoice.map((o) => (
                <button key={o.id} onClick={() => onOpen(o.id)} style={{ textAlign: "left", border: `1px solid ${C.line}`, borderLeft: `4px solid #2563EB`, borderRadius: 6, padding: 12, background: C.card }}>
                  <Row style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <span style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, color: C.ink }}>{o.customer_name}</span>
                      <span style={{ fontFamily: DISPLAY, fontSize: 14, color: C.slate, marginLeft: 8 }}>{[o.year, o.make, o.model].filter(Boolean).join(" ")}</span>
                      {o.issue && <div style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginTop: 2 }}>{o.issue}</div>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#2563EB", fontFamily: BODY, whiteSpace: "nowrap" }}>Open →</span>
                  </Row>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {isWatcher && (
        <Card style={{ marginTop: 12 }}>
          <SectionTitle>Work order updates{notesFeed.length ? ` · ${notesFeed.length}` : ""}</SectionTitle>
          <p style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 2, marginBottom: 8 }}>
            The latest notes added to active work orders. Tap one to open the job.
          </p>
          {notesFeed.length === 0 ? (
            <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No notes yet on active work orders.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {notesFeed.map((n) => (
                <button key={n.id} onClick={() => onOpen(n.order_id)} style={{ textAlign: "left", border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px", background: C.card }}>
                  <Row style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999, background: C.teal + "1A", color: C.teal, fontFamily: BODY }}>
                      {n.order.customer_name}{[n.order.year, n.order.make, n.order.model].filter(Boolean).length ? ` · ${[n.order.year, n.order.make, n.order.model].filter(Boolean).join(" ")}` : ""}
                    </span>
                    <span style={{ fontSize: 11, color: C.slate, fontFamily: BODY, whiteSpace: "nowrap" }}>{fmtDate(n.created_at)}</span>
                  </Row>
                  <div style={{ fontSize: 14, color: C.ink, fontFamily: BODY, marginTop: 4, whiteSpace: "pre-wrap" }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: C.slate, fontFamily: BODY, marginTop: 2 }}>— {nameOf(n.author_id)}</div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card style={{ marginTop: 12 }}>
        <SectionTitle>Today's schedule{todays.length ? ` · ${todays.length}` : ""}</SectionTitle>
        {overdue.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.red, fontFamily: BODY, marginBottom: 6 }}>Past due · {overdue.length}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{overdue.map((o) => schedRow(o, true))}</div>
          </div>
        )}
        {todays.length === 0 ? (
          <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing scheduled for today.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{todays.map((o) => schedRow(o, false))}</div>
        )}
        {upcoming.length > 0 && (
          <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 10 }}>
            Next up: {upcoming.slice(0, 3).map((o) => `${o.customer_name} (${fmtDate(dOf(o))})`).join(", ")}{upcoming.length > 3 ? ` +${upcoming.length - 3} more` : ""}
          </div>
        )}
      </Card>

      {mgr && (
        <Card style={{ marginTop: 12 }}>
          <SectionTitle>Send a message</SectionTitle>
          <Row>
            <Select value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "auto", minWidth: 150 }}>
              <option value="">— To —</option>
              <option value="all">Everyone</option>
              {crew.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </Select>
            <TextInput placeholder="Message — e.g. Call the Yamaha customer first thing" value={body} onChange={(e) => setBody(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <button onClick={send} disabled={!to || !body.trim()} style={{ ...btn(C.teal), opacity: !to || !body.trim() ? 0.4 : 1 }}>Send</button>
          </Row>
          {sent && <div style={{ fontSize: 12, fontWeight: 600, color: C.teal, fontFamily: BODY, marginTop: 6 }}>{sent}</div>}
        </Card>
      )}

      {mgr && (
        <Card style={{ marginTop: 12 }}>
          <SectionTitle>Sent</SectionTitle>
          {sentBatches.length === 0 ? (
            <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>You haven't sent any messages yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sentBatches.map((b) => {
                const batchReplies = b.ids.flatMap((id) => repliesByParent[id] || [])
                  .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
                const unreadReplies = batchReplies.filter((r) => !r.read && r.recipient_id === profile.id).length;
                return (
                  <div key={b.key} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px", background: "#fff" }}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: BODY }}>To: {recipLabel(b)}</span>
                      <span style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>{fmtDate(b.created_at)}</span>
                    </Row>
                    <div style={{ fontSize: 14, color: C.ink, fontFamily: BODY, marginTop: 4, marginBottom: 6, whiteSpace: "pre-wrap" }}>{b.body}</div>

                    {batchReplies.length > 0 && (
                      <div style={{ borderLeft: `2px solid ${C.line}`, paddingLeft: 10, marginBottom: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                        {batchReplies.map((r) => (
                          <div key={r.id} style={{ background: !r.read && r.recipient_id === profile.id ? "#FFFDF7" : "transparent", borderRadius: 4, padding: !r.read && r.recipient_id === profile.id ? "4px 6px" : 0 }}>
                            <Row style={{ justifyContent: "space-between" }}>
                              <Row style={{ gap: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: C.teal, fontFamily: BODY }}>{r.sender_id === profile.id ? "You" : nameOf(r.sender_id)} replied</span>
                                {!r.read && r.recipient_id === profile.id && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "1px 6px", borderRadius: 999, background: C.orange, color: "#fff" }}>New</span>}
                              </Row>
                              <span style={{ fontSize: 11, color: C.slate, fontFamily: BODY }}>{fmtDate(r.created_at)}</span>
                            </Row>
                            <div style={{ fontSize: 13, color: C.ink, fontFamily: BODY, whiteSpace: "pre-wrap" }}>{r.body}</div>
                            {!r.read && r.recipient_id === profile.id && (
                              <button onClick={() => setRead(r, true)} style={{ fontSize: 11, fontWeight: 600, color: C.teal, fontFamily: BODY, marginTop: 2 }}>Mark read</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <Row style={{ gap: 12 }}>
                      <span style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>Read by {b.readCount}/{b.ids.length}</span>
                      {batchReplies.length > 0 && <span style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>{batchReplies.length} repl{batchReplies.length === 1 ? "y" : "ies"}{unreadReplies ? ` · ${unreadReplies} new` : ""}</span>}
                      <button onClick={() => removeBatch(b)} style={{ fontSize: 12, color: C.red, fontFamily: BODY }}>delete</button>
                    </Row>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <Card style={{ marginTop: 12 }}>
        <SectionTitle right={unreadCount > 0 ? <button onClick={markAllRead} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.teal }}>Mark all read</button> : null}>
          Messages{unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
        </SectionTitle>
        {inboxTop.length === 0 ? (
          <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No messages right now.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {inboxTop.map((m) => {
              const thread = repliesByParent[m.id] || [];
              return (
                <div key={m.id} style={{
                  border: `1px solid ${C.line}`, borderLeft: `4px solid ${m.read ? "#D6DEE3" : C.orange}`,
                  borderRadius: 6, padding: "10px 12px", background: m.read ? "#fff" : "#FFFDF7", opacity: m.read ? 0.7 : 1,
                }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Row style={{ gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: BODY }}>{nameOf(m.sender_id)}</span>
                      {!m.read && <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "1px 7px", borderRadius: 999, background: C.orange, color: "#fff" }}>New</span>}
                    </Row>
                    <span style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>{fmtDate(m.created_at)}</span>
                  </Row>
                  <div style={{ fontSize: 14, color: C.ink, fontFamily: BODY, marginTop: 4, marginBottom: 6, whiteSpace: "pre-wrap", fontWeight: m.read ? 400 : 600 }}>{m.body}</div>

                  {thread.length > 0 && (
                    <div style={{ borderLeft: `2px solid ${C.line}`, paddingLeft: 10, marginBottom: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                      {thread.map((r) => (
                        <div key={r.id}>
                          <Row style={{ justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.teal, fontFamily: BODY }}>{r.sender_id === profile.id ? "You" : nameOf(r.sender_id)}</span>
                            <span style={{ fontSize: 11, color: C.slate, fontFamily: BODY }}>{fmtDate(r.created_at)}</span>
                          </Row>
                          <div style={{ fontSize: 13, color: C.ink, fontFamily: BODY, whiteSpace: "pre-wrap" }}>{r.body}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {replyTo === m.id ? (
                    <div style={{ marginTop: 4 }}>
                      <TextInput placeholder="Write a reply…" value={replyText} onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") sendReply(m); }} style={{ width: "100%" }} autoFocus />
                      <Row style={{ gap: 10, marginTop: 6 }}>
                        <button onClick={() => sendReply(m)} disabled={!replyText.trim()} style={{ ...btn(C.teal), opacity: replyText.trim() ? 1 : 0.4 }}>Send reply</button>
                        <button onClick={() => { setReplyTo(null); setReplyText(""); setReplyErr(""); }} style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>cancel</button>
                      </Row>
                      {replyErr && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY, marginTop: 4 }}>{replyErr}</div>}
                    </div>
                  ) : (
                    <Row style={{ gap: 12 }}>
                      <button onClick={() => { setReplyTo(m.id); setReplyText(""); }} style={{ fontSize: 12, fontWeight: 600, color: C.teal, fontFamily: BODY }}>Reply</button>
                      <button onClick={() => setRead(m, !m.read)} style={{ fontSize: 12, fontWeight: 600, color: C.teal, fontFamily: BODY }}>{m.read ? "Mark unread" : "Mark read"}</button>
                      <button onClick={() => remove(m)} style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>remove</button>
                    </Row>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionTitle>Assigned to you ({myOrders.length})</SectionTitle>
        {myOrders.length === 0 ? (
          <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>Nothing assigned to you right now.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {myOrders.map((o) => (
              <button key={o.id} onClick={() => onOpen(o.id)} style={{ textAlign: "left", border: `1px solid ${C.line}`, borderRadius: 6, padding: 12, background: C.card }}>
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, color: C.ink }}>{o.customer_name}</span>
                    {o.kind === "maintenance" ? (
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 999, background: "#A162071A", color: "#A16207", marginLeft: 8 }}>Maintenance</span>
                    ) : (
                      <span style={{ fontFamily: DISPLAY, fontSize: 14, color: C.slate, marginLeft: 8 }}>{[o.year, o.make, o.model].filter(Boolean).join(" ")}</span>
                    )}
                    <div style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginTop: 2 }}>{o.issue}</div>
                  </div>
                  <StatusChip status={o.status} />
                </Row>
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
