import { useState } from "react";
import { supabase, C, DISPLAY, BODY } from "../lib/supabase";
import { Card, Row, TextInput, Select, Label, SectionTitle, btn } from "../lib/ui";

export default function Settings({ settings, crew = [], onSaved, onBack }) {
  const [f, setF] = useState({
    mileage_rate: settings?.mileage_rate ?? 0.7,
    ot_weekly_threshold: settings?.ot_weekly_threshold ?? 40,
    ot_multiplier: settings?.ot_multiplier ?? 1.5,
    shop_rate: settings?.shop_rate ?? 0,
    invoicer_id: settings?.invoicer_id ?? "",
    notes_watcher_id: settings?.notes_watcher_id ?? "",
  });
  const [msg, setMsg] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const payload = {
      id: 1,
      mileage_rate: Number(f.mileage_rate) || 0,
      ot_weekly_threshold: Number(f.ot_weekly_threshold) || 40,
      ot_multiplier: Number(f.ot_multiplier) || 1.5,
      shop_rate: Number(f.shop_rate) || 0,
      invoicer_id: f.invoicer_id || null,
      notes_watcher_id: f.notes_watcher_id || null,
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

      <SectionTitle>Shop labor rate</SectionTitle>
      <div style={{ maxWidth: 200 }}>
        <Label>Rate charged to customer ($/hr)</Label>
        <TextInput type="number" step="1" min="0" value={f.shop_rate} onChange={set("shop_rate")} />
      </div>
      <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 6, maxWidth: 420 }}>
        Default hourly rate used to price labor on a work order. Each order can override it.
      </div>

      <SectionTitle>Invoicing</SectionTitle>
      <div style={{ maxWidth: 260 }}>
        <Label>Ready-for-invoice orders go to</Label>
        <Select value={f.invoicer_id} onChange={set("invoicer_id")}>
          <option value="">— Nobody (list hidden) —</option>
          {crew.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
        </Select>
      </div>
      <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 6, maxWidth: 420 }}>
        When anyone moves a work order to “Ready for Invoice,” it shows up in this person’s Ready-for-invoice list on their home dashboard, and they get a message.
      </div>

      <SectionTitle>Work-order updates</SectionTitle>
      <div style={{ maxWidth: 260 }}>
        <Label>Notes feed goes to</Label>
        <Select value={f.notes_watcher_id} onChange={set("notes_watcher_id")}>
          <option value="">— Nobody (feed hidden) —</option>
          {crew.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
        </Select>
      </div>
      <div style={{ fontSize: 12, color: C.slate, fontFamily: BODY, marginTop: 6, maxWidth: 420 }}>
        This person gets a live “Work order updates” feed on their home dashboard — every note added to any work order, tagged with the job and linked, so they can follow progress without opening each order.
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
