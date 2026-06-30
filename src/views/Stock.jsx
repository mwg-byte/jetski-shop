import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY } from "../lib/supabase";
import { Card, Row, TextInput, Select, Label, SectionTitle, btn, btnSm } from "../lib/ui";
import { useAuth } from "../AuthContext";

export default function Stock({ onBack }) {
  const { profile } = useAuth();
  const mgr = ["owner", "manager"].includes(profile.role);
  const [cats, setCats] = useState([]);
  const [items, setItems] = useState([]);
  const [catName, setCatName] = useState("");
  const [form, setForm] = useState({ name: "", category_id: "", unit: "", qty: "0", note: "" });
  const [editId, setEditId] = useState(null);
  const [ev, setEv] = useState({});

  async function load() {
    const [{ data: c }, { data: i }] = await Promise.all([
      supabase.from("stock_categories").select("*").order("sort").order("name"),
      supabase.from("stock_items").select("*").order("name"),
    ]);
    setCats(c || []); setItems(i || []);
  }
  useEffect(() => { load(); }, []);

  async function addCat() {
    if (!catName.trim()) return;
    const { data } = await supabase.from("stock_categories").insert({ name: catName.trim(), sort: cats.length }).select().single();
    if (data) { setCats([...cats, data]); setCatName(""); }
  }
  async function removeCat(c) {
    setCats(cats.filter((x) => x.id !== c.id));
    setItems(items.map((it) => (it.category_id === c.id ? { ...it, category_id: null } : it)));
    await supabase.from("stock_categories").delete().eq("id", c.id);
  }
  async function addItem() {
    if (!form.name.trim()) return;
    const { data } = await supabase.from("stock_items").insert({
      name: form.name.trim(), category_id: form.category_id || null, unit: form.unit.trim(),
      qty: Number(form.qty) || 0, note: form.note.trim(),
    }).select().single();
    if (data) { setItems([...items, data]); setForm({ name: "", category_id: form.category_id, unit: "", qty: "0", note: "" }); }
  }
  function startEdit(it) {
    setEditId(it.id);
    setEv({ name: it.name, category_id: it.category_id || "", unit: it.unit || "", qty: String(it.qty), note: it.note || "" });
  }
  async function saveEdit(it) {
    const patch = {
      name: ev.name.trim() || it.name, category_id: ev.category_id || null,
      unit: ev.unit.trim(), qty: Number(ev.qty) || 0, note: ev.note.trim(),
    };
    setItems(items.map((x) => (x.id === it.id ? { ...x, ...patch } : x)));
    setEditId(null);
    await supabase.from("stock_items").update(patch).eq("id", it.id);
  }
  async function removeItem(it) {
    setItems(items.filter((x) => x.id !== it.id));
    await supabase.from("stock_items").delete().eq("id", it.id);
  }
  async function bump(it, delta) {
    const qty = Math.max(0, Number(it.qty) + delta);
    setItems(items.map((x) => (x.id === it.id ? { ...x, qty } : x)));
    await supabase.from("stock_items").update({ qty }).eq("id", it.id);
  }

  const groups = [
    ...cats.map((c) => ({ cat: c, list: items.filter((i) => i.category_id === c.id) })),
    { cat: null, list: items.filter((i) => !i.category_id) },
  ].filter((g) => g.cat || g.list.length);

  const qtyColor = (q) => (Number(q) <= 0 ? C.red : Number(q) <= 2 ? "#A16207" : C.green);

  return (
    <Card>
      <button onClick={onBack} style={{ fontSize: 14, fontWeight: 600, color: C.teal, fontFamily: BODY }}>← All work orders</button>
      <h2 style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, textTransform: "uppercase", color: C.ink, marginTop: 8 }}>Stock</h2>
      <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY }}>
        Your shop's stock on hand, organized by category. {mgr ? "Add categories and items, and adjust counts as you restock." : "View only — counts are managed by owners and managers."}
      </p>

      {mgr && (
        <>
          <SectionTitle>Add a category</SectionTitle>
          <Row>
            <TextInput placeholder="Category — Consumables, Carb parts…" value={catName} onChange={(e) => setCatName(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <button onClick={addCat} style={btn(C.ink)}>Add category</button>
          </Row>

          <SectionTitle>Add a stock item</SectionTitle>
          <Row>
            <TextInput placeholder="Item — e.g. Carb rebuild kit" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
            <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} style={{ width: "auto" }}>
              <option value="">— Category —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <TextInput placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={{ width: 70 }} />
            <TextInput type="number" min="0" placeholder="Qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} style={{ width: 80 }} />
            <TextInput placeholder="Note (part #, location…)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
            <button onClick={addItem} style={btn(C.teal)}>Add item</button>
          </Row>
        </>
      )}

      {groups.length === 0 ? (
        <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY, marginTop: 20 }}>No stock yet.{mgr ? " Add a category and some items above." : ""}</div>
      ) : groups.map((g) => (
        <div key={g.cat?.id || "uncat"}>
          <SectionTitle right={mgr && g.cat ? <button onClick={() => removeCat(g.cat)} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.red }}>remove</button> : null}>
            {g.cat ? g.cat.name : "Uncategorized"} ({g.list.length})
          </SectionTitle>
          {g.list.length === 0 ? (
            <div style={{ fontSize: 14, color: C.slate, fontFamily: BODY }}>No items in this category.</div>
          ) : (
            <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
              {g.list.map((it) => editId === it.id ? (
                <div key={it.id} style={{ padding: "10px 12px", borderBottom: `1px solid ${C.line}`, background: "#F6F8F9" }}>
                  <Row style={{ flexWrap: "wrap", gap: 8 }}>
                    <TextInput value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} style={{ flex: 2, minWidth: 140 }} />
                    <Select value={ev.category_id} onChange={(e) => setEv({ ...ev, category_id: e.target.value })} style={{ width: "auto" }}>
                      <option value="">— Category —</option>
                      {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                    <TextInput placeholder="Unit" value={ev.unit} onChange={(e) => setEv({ ...ev, unit: e.target.value })} style={{ width: 70 }} />
                    <TextInput type="number" min="0" value={ev.qty} onChange={(e) => setEv({ ...ev, qty: e.target.value })} style={{ width: 80 }} />
                    <TextInput placeholder="Note" value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                    <button onClick={() => saveEdit(it)} style={btnSm(C.teal)}>Save</button>
                    <button onClick={() => setEditId(null)} style={{ fontSize: 12, fontWeight: 600, color: C.slate, fontFamily: BODY }}>Cancel</button>
                  </Row>
                </div>
              ) : (
                <Row key={it.id} style={{ padding: "8px 12px", fontSize: 14, borderBottom: `1px solid ${C.line}`, fontFamily: BODY, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, color: qtyColor(it.qty), minWidth: 54 }}>{it.qty}{it.unit ? ` ${it.unit}` : ""}</span>
                  <span style={{ fontWeight: 600, color: C.ink }}>{it.name}</span>
                  <span style={{ flex: 1, minWidth: 60, color: C.slate }}>{it.note}</span>
                  {mgr && (
                    <Row style={{ gap: 4 }}>
                      <button onClick={() => bump(it, -1)} style={{ width: 28, height: 28, borderRadius: 6, background: "#F1F4F6", color: C.ink, fontSize: 18, fontWeight: 700 }}>−</button>
                      <button onClick={() => bump(it, 1)} style={{ width: 28, height: 28, borderRadius: 6, background: "#F1F4F6", color: C.ink, fontSize: 16, fontWeight: 700 }}>+</button>
                      <button onClick={() => startEdit(it)} style={{ fontSize: 12, color: C.teal }}>edit</button>
                      <button onClick={() => removeItem(it)} style={{ fontSize: 12, color: C.red }}>remove</button>
                    </Row>
                  )}
                </Row>
              ))}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
