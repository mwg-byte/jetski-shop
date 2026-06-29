import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, isManager } from "../lib/supabase";
import { Card, Row, TextInput, Select, Label, SectionTitle, btn, btnSm } from "../lib/ui";
import { useAuth } from "../AuthContext";

const ROLE_LABELS = { owner: "Owner", manager: "Manager", tech: "Tech", maintenance: "Maintenance" };
const ROLE_COLORS = { owner: "#7C3AED", manager: "#0369A1", tech: "#5B6B76", maintenance: "#A16207" };

export default function Crew({ onBack, onCrewChange }) {
  const { profile } = useAuth();
  const isOwner = profile.role === "owner";
  const [people, setPeople] = useState([]);
  const [rates, setRates] = useState({}); // tech_id -> hourly_rate
  const [msg, setMsg] = useState("");

  async function load() {
    const [{ data: profs }, { data: payRates }] = await Promise.all([
      supabase.from("profiles").select("*").order("active", { ascending: true }).order("display_name"),
      supabase.from("pay_rates").select("*"),
    ]);
    setPeople(profs || []);
    const map = {};
    (payRates || []).forEach((r) => { map[r.tech_id] = r.hourly_rate; });
    setRates(map);
  }
  useEffect(() => { load(); }, []);

  async function setActive(p, active) {
    const { error } = await supabase.from("profiles").update({ active }).eq("id", p.id);
    if (error) return setMsg(error.message);
    await load(); onCrewChange?.();
  }
  async function setRole(p, role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", p.id);
    if (error) return setMsg(error.message);
    await load();
  }
  async function setRate(p, hourly_rate) {
    const rate = Number(hourly_rate) || 0;
    setRates({ ...rates, [p.id]: rate });
    await supabase.from("pay_rates").upsert({ tech_id: p.id, hourly_rate: rate });
  }

  const pending = people.filter((p) => !p.active);
  const active = people.filter((p) => p.active);

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Crew</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        New people sign up themselves, then you approve them here. {isOwner ? "As owner, you can also promote people to manager or owner." : "Only owners can change roles."}
      </p>
      {msg && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY, marginTop: 8 }}>{msg}</div>}

      {pending.length > 0 && (
        <>
          <SectionTitle>Waiting for approval</SectionTitle>
          <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
            {pending.map((p) => (
              <Row key={p.id} style={{ padding: "10px 12px", borderBottom: `1px solid ${C.line}`, fontFamily: BODY }}>
                <span style={{ fontWeight: 600, color: C.ink }}>{p.display_name}</span>
                <button onClick={() => setActive(p, true)} style={{ ...btnSm(C.green), marginLeft: "auto" }}>Approve</button>
                <button onClick={() => setActive(p, false)} style={btnSm("#F1F4F6", C.slate)}>Dismiss</button>
              </Row>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Active crew</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {active.map((p) => (
          <div key={p.id} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 12 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Row>
                <span style={{ fontWeight: 700, color: C.ink, fontFamily: BODY, fontSize: 15 }}>{p.display_name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: ROLE_COLORS[p.role] + "1A", color: ROLE_COLORS[p.role] }}>{ROLE_LABELS[p.role]}</span>
                {p.id === profile.id && <span style={{ fontSize: 12, color: C.slate, fontFamily: BODY }}>(you)</span>}
              </Row>
              {p.id !== profile.id && (
                <button onClick={() => setActive(p, false)} style={{ fontSize: 12, color: C.red, fontFamily: BODY }}>deactivate</button>
              )}
            </Row>
            <Row style={{ marginTop: 10, gap: 16 }}>
              {isManager(profile.role) && (
                <div>
                  <Label>Pay rate ($/hr)</Label>
                  <TextInput type="number" step="0.5" min="0" value={rates[p.id] ?? ""} placeholder="0.00"
                    onChange={(e) => setRates({ ...rates, [p.id]: e.target.value })}
                    onBlur={(e) => setRate(p, e.target.value)} style={{ width: 110 }} />
                </div>
              )}
              {isOwner && p.id !== profile.id && (
                <div>
                  <Label>Role</Label>
                  <Select value={p.role} onChange={(e) => setRole(p, e.target.value)} style={{ width: 140 }}>
                    <option value="tech">Tech</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="manager">Manager</option>
                    <option value="owner">Owner</option>
                  </Select>
                </div>
              )}
            </Row>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 12 }}>
        Pay rates are visible only to managers and owners — techs can't see them.
      </p>
    </Card>
  );
}