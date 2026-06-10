import { useState } from "react";
import { supabase, C, DISPLAY, BODY } from "../lib/supabase";
import { Card, Row, TextInput, Label, SectionTitle, btn } from "../lib/ui";

export default function Settings({ settings, onSaved, onBack }) {
  const [f, setF] = useState({
    mileage_rate: settings?.mileage_rate ?? 0.7,
    ot_weekly_threshold: settings?.ot_weekly_threshold ?? 40,
    ot_multiplier: settings?.ot_multiplier ?? 1.5,
  });
  const [msg, setMsg] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const payload = {
      id: 1,
      mileage_rate: Number(f.mileage_rate) || 0,
      ot_weekly_threshold: Number(f.ot_weekly_threshold) || 40,
      ot_multiplier: Number(f.ot_multiplier) || 1.5,
    };
    const { error } = await supabase.from("settings").update(payload).eq("id", 1);
    if (error) setMsg(error.message);
    else { setMsg("Saved."); onSaved?.(payload); }
  }

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Settings</h2>

      <SectionTitle>Mileage</SectionTitle>
      <div style={{ maxWidth: 200 }}>
        <Label>Reimbursement rate ($/mile)</Label>
        <TextInput type="number" step="0.005" min="0" value={f.mileage_rate} onChange={set("mileage_rate")} />
      </div>

      <SectionTitle>Overtime</SectionTitle>
      <Row style={{ alignItems: "flex-end" }}>
        <div style={{ maxWidth: 200 }}>
          <Label>Weekly OT threshold (hrs)</Label>
          <TextInput type="number" step="1" min="0" value={f.ot_weekly_threshold} onChange={set("ot_weekly_threshold")} />
        </div>
        <div style={{ maxWidth: 200 }}>
          <Label>OT multiplier</Label>
          <TextInput type="number" step="0.1" min="1" value={f.ot_multiplier} onChange={set("ot_multiplier")} />
        </div>
      </Row>

      <Row style={{ marginTop: 20 }}>
        <button onClick={save} style={btn(C.orange)}>Save settings</button>
        {msg && <span style={{ fontSize: 13, color: msg === "Saved." ? C.green : C.red, fontFamily: BODY }}>{msg}</span>}
      </Row>
    </Card>
  );
}
