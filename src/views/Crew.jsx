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
  const [pay, setPay] = useState({}); // tech_id -> { pay_type, hourly_rate, salary }
  const [msg, setMsg] = useState("");

  async function load() {
    const [{ data: profs }, { data: payRates }] = await Promise.all([
      supabase.from("profiles").select("*").order("active", { ascending: true }).order("display_name"),
      supabase.from("pay_rates").select("*"),
    ]);
    setPeople(profs || []);
    const map = {};
    (payRates || []).forEach((r) => { map[r.tech_id] = { pay_type: r.pay_type || "hourly", hourly_rate: r.hourly_rate ?? 0, salary: r.salary ?? 0 }; });
    setPay(map);
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
  async function savePay(p, patch) {
    const cur = pay[p.id] || { pay_type: "hourly", hourly_rate: 0, salary: 0 };
    const next = { ...cur, ...patch };
    setPay({ ...pay, [p.id]: next });
    await supabase.from("pay_rates").upsert({
      tech_id: p.id,
      pay_type: next.pay_type || "hourly",
      hourly_rate: Number(next.hourly_rate) || 0,
      salary: Number(next.salary) || 0,
    });
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
              {isManager(profile.role) && (() => {
                const pp = pay[p.id] || { pay_type: "hourly", hourly_rate: "", salary: "" };
                const setLocal = (patch) => setPay({ ...pay, [p.id]: { ...pp, ...patch } });
                return (
                  <>
                    <div>
                      <Label>Pay type</Label>
                      <Select value={pp.pay_type} onChange={(e) => savePay(p, { pay_type: e.target.value })} style={{ width: 120 }}>
                        <option value="hourly">Hourly</option>
                        <option value="salary">Salary</option>
                      </Select>
                    </div>
                    {pp.pay_type === "salary" ? (
                      <div>
                        <Label>Annual salary ($)</Label>
                        <TextInput type="number" step="100" min="0" value={pp.salary ?? ""} placeholder="0"
                          onChange={(e) => setLocal({ salary: e.target.value })}
                          onBlur={(e) => savePay(p, { salary: e.target.value })} style={{ width: 130 }} />
                      </div>
                    ) : (
                      <div>
                        <Label>Pay rate ($/hr)</Label>
                        <TextInput type="number" step="0.5" min="0" value={pp.hourly_rate ?? ""} placeholder="0.00"
                          onChange={(e) => setLocal({ hourly_rate: e.target.value })}
                          onBlur={(e) => savePay(p, { hourly_rate: e.target.value })} style={{ width: 110 }} />
                      </div>
                    )}
                  </>
                );
              })()}
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