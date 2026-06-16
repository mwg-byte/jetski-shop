import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, fmtDate } from "../lib/supabase";
import { Card, Row, TextInput, Select, SectionTitle, StatusChip, btn } from "../lib/ui";
import { useAuth } from "../AuthContext";

export default function Dashboard({ crew, orders, assignees = {}, mgr, onOpen }) {
  const { profile } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState("");

  const nameOf = (id) => crew.find((c) => c.id === id)?.display_name || "Someone";

  async function loadMsgs() {
    const { data } = await supabase.from("dashboard_messages").select("*").eq("recipient_id", profile.id).order("created_at", { ascending: false });
    setMsgs(data || []);
  }
  useEffect(() => { loadMsgs(); }, []);

  const myOrders = orders.filter((o) => (assignees[o.id] || []).includes(profile.id) && o.status !== "closed");

  async function send() {
    if (!body.trim() || !to) return;
    const recipients = to === "all" ? crew.map((c) => c.id) : [to];
    const rows = recipients.map((rid) => ({ recipient_id: rid, sender_id: profile.id, body: body.trim() }));
    setSent("Sending…");
    const { error } = await supabase.from("dashboard_messages").insert(rows);
    if (error) { setSent("Couldn't send — try again"); return; }
    setBody(""); setTo(""); setSent("Sent ✓");
    loadMsgs();
    setTimeout(() => setSent(""), 2500);
  }
  async function dismiss(m) {
    setMsgs(msgs.filter((x) => x.id !== m.id));
    await supabase.from("dashboard_messages").delete().eq("id", m.id);
  }

  return (
    <>
      <Card>
        <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink }}>
          Hi, {profile.display_name?.split(" ")[0] || "there"}
        </h2>
        <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>Your messages and what you're assigned to.</p>
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

      <Card style={{ marginTop: 12 }}>
        <SectionTitle>Messages ({msgs.length})</SectionTitle>
        {msgs.length === 0 ? (
          <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No messages right now.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {msgs.map((m) => (
              <div key={m.id} style={{ border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.orange}`, borderRadius: 6, padding: "10px 12px", background: "#FFFDF7" }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: BODY }}>{nameOf(m.sender_id)}</span>
                  <Row style={{ gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>{fmtDate(m.created_at)}</span>
                    <button onClick={() => dismiss(m)} style={{ fontSize: 12, color: C.teal, fontFamily: BODY }}>dismiss</button>
                  </Row>
                </Row>
                <div style={{ fontSize: 14, color: C.ink, fontFamily: BODY, marginTop: 4, whiteSpace: "pre-wrap" }}>{m.body}</div>
              </div>
            ))}
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
