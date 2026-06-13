import { useState, useEffect } from "react";
import { supabase, C, DISPLAY, BODY, isManager } from "./lib/supabase";
import { useAuth } from "./AuthContext";
import { Row } from "./lib/ui";
import { WorkOrderList, NewOrderForm, MaintenanceForm } from "./views/WorkOrders";
import OrderDetail from "./views/OrderDetail";
import ShiftClock from "./views/ShiftClock";
import LakeClock from "./views/LakeClock";
import MyHours from "./views/MyHours";
import Mileage from "./views/Mileage";
import Crew from "./views/Crew";
import Payroll from "./views/Payroll";
import Reports from "./views/Reports";
import Reimbursement from "./views/Reimbursement";
import ItemRequests from "./views/ItemRequests";
import Inventory from "./views/Inventory";
import MaintenanceTab from "./views/MaintenanceTab";
import Settings from "./views/Settings";

export default function App() {
  const { profile } = useAuth();
  const mgr = isManager(profile.role);
  const canMaint = ["owner", "manager", "maintenance"].includes(profile.role);
  const [view, setView] = useState({ name: "list" });
  const [orders, setOrders] = useState([]);
  const [crew, setCrew] = useState([]);
  const [liveCounts, setLiveCounts] = useState({});
  const [activeShiftCount, setActiveShiftCount] = useState(0);
  const [settings, setSettings] = useState(null);
  const [assignees, setAssignees] = useState({});

  async function loadOrders() {
    const { data } = await supabase.from("work_orders").select("*").order("priority");
    setOrders(data || []);
    const { data: js } = await supabase.from("job_sessions").select("order_id, tech_id");
    const counts = {};
    (js || []).forEach((s) => { counts[s.order_id] = (counts[s.order_id] || 0) + 1; });
    setLiveCounts(counts);
    const { data: asg } = await supabase.from("order_assignees").select("order_id, tech_id");
    const byOrder = {};
    (asg || []).forEach((a) => { (byOrder[a.order_id] = byOrder[a.order_id] || []).push(a.tech_id); });
    setAssignees(byOrder);
    const { count } = await supabase.from("shifts").select("*", { count: "exact", head: true }).is("ended_at", null);
    setActiveShiftCount(count || 0);
  }
  async function loadCrew() {
    const { data } = await supabase.from("profiles").select("id, display_name, role").eq("active", true).order("display_name");
    setCrew(data || []);
  }
  async function loadSettings() {
    const { data } = await supabase.from("settings").select("*").eq("id", 1).single();
    setSettings(data);
  }
  useEffect(() => { loadOrders(); loadCrew(); loadSettings(); }, []);

  async function reorder(id, dir) {
    const i = orders.findIndex((o) => o.id === id);
    const j = i + dir;
    if (j < 0 || j >= orders.length) return;
    const next = [...orders];
    [next[i], next[j]] = [next[j], next[i]];
    setOrders(next);
    await Promise.all(next.map((o, idx) => supabase.from("work_orders").update({ priority: idx }).eq("id", o.id)));
  }

  const navItems = [
    { key: "list", label: "Work orders", show: true },
    { key: "maintenance", label: "Maintenance", show: profile.role === "maintenance" },
    { key: "timeclock", label: "Time clock", show: true },
    { key: "myhours", label: "My hours", show: true },
    { key: "laketest", label: "Lake test", show: true },
    { key: "mileage", label: "Mileage", show: true },
    { key: "reimbursement", label: "Reimbursement", show: true },
    { key: "items", label: "Item requests", show: true },
    { key: "inventory", label: "Inventory", show: mgr },
    { key: "payroll", label: "Payroll", show: mgr },
    { key: "reports", label: "Reports", show: mgr },
    { key: "crew", label: "Crew", show: mgr },
    { key: "settings", label: "Settings", show: mgr },
  ].filter((n) => n.show);

  return (
    <div style={{ minHeight: "100vh", background: C.surface, paddingBottom: 48 }}>
      <header style={{ background: C.ink }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px" }}>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 700, textTransform: "uppercase", color: "#fff", letterSpacing: "0.04em", lineHeight: 1 }}>
                Jet Ski Shop
              </div>
              <div style={{ fontSize: 12, color: "#7E93A3", fontFamily: BODY, marginTop: 4 }}>
                {orders.filter((o) => o.status !== "closed").length} open ·{" "}
                {activeShiftCount > 0 ? <span style={{ color: "#6EE7B7", fontWeight: 600 }}>{activeShiftCount} on shift</span> : "nobody on shift"}
              </div>
            </div>
            <Row style={{ gap: 10 }}>
              <span style={{ fontSize: 12, color: "#CFE0EA", fontFamily: BODY }}>{profile.display_name} · {profile.role}</span>
              <button onClick={() => supabase.auth.signOut()} style={{ fontSize: 12, fontWeight: 600, color: "#7E93A3", fontFamily: BODY }}>Sign out</button>
            </Row>
          </Row>
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {navItems.map((n) => (
              <button key={n.key} onClick={() => setView({ name: n.key })} style={{
                fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 6,
                background: view.name === n.key ? C.orange : "#1B3A50",
                color: view.name === n.key ? "#fff" : "#CFE0EA",
              }}>{n.label}</button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {canMaint && (
                <button onClick={() => setView({ name: "newmaint" })} style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 6, background: "#A16207", color: "#fff" }}>
                  + Maintenance task
                </button>
              )}
              {mgr && (
                <button onClick={() => setView({ name: "new" })} style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 6, background: "#fff", color: C.ink }}>
                  + New order
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "16px" }}>
        {view.name === "new" ? (
          <NewOrderForm nextPriority={orders.length} onCancel={() => setView({ name: "list" })}
            onDone={(o) => { setOrders([...orders, o]); setView({ name: "detail", id: o.id }); }} />
        ) : view.name === "newmaint" ? (
          <MaintenanceForm nextPriority={orders.length} onCancel={() => setView({ name: "list" })}
            onDone={(o) => { loadOrders(); setView({ name: "detail", id: o.id }); }} />
        ) : view.name === "detail" ? (
          <OrderDetail orderId={view.id} crew={crew} canDelete={mgr}
            onBack={() => { loadOrders(); setView({ name: "list" }); }} />
        ) : view.name === "timeclock" ? (
          <ShiftClock crew={crew} onBack={() => { loadOrders(); setView({ name: "list" }); }} />
        ) : view.name === "myhours" ? (
          <MyHours crew={crew} orders={orders} onBack={() => setView({ name: "list" })} />
        ) : view.name === "laketest" ? (
          <LakeClock crew={crew} orders={orders} onBack={() => { loadOrders(); setView({ name: "list" }); }} />
        ) : view.name === "mileage" ? (
          <Mileage crew={crew} settings={settings} onBack={() => setView({ name: "list" })} />
        ) : view.name === "reimbursement" ? (
          <Reimbursement crew={crew} onBack={() => setView({ name: "list" })} />
        ) : view.name === "items" ? (
          <ItemRequests crew={crew} onBack={() => setView({ name: "list" })} />
        ) : view.name === "inventory" ? (
          <Inventory crew={crew} orders={orders} onBack={() => setView({ name: "list" })} />
        ) : view.name === "maintenance" ? (
          <MaintenanceTab orders={orders} crew={crew} assignees={assignees} liveCounts={liveCounts}
            onOpen={(id) => setView({ name: "detail", id })} onBack={() => setView({ name: "list" })} />
        ) : view.name === "payroll" ? (
          <Payroll crew={crew} settings={settings} onBack={() => setView({ name: "list" })} />
        ) : view.name === "reports" ? (
          <Reports onBack={() => setView({ name: "list" })} />
        ) : view.name === "crew" ? (
          <Crew onCrewChange={loadCrew} onBack={() => setView({ name: "list" })} />
        ) : view.name === "settings" ? (
          <Settings settings={settings} onSaved={setSettings} onBack={() => setView({ name: "list" })} />
        ) : (
          <WorkOrderList orders={orders} crew={crew} liveCounts={liveCounts} assignees={assignees} canCreate={mgr}
            onOpen={(id) => setView({ name: "detail", id })} onReorder={reorder} onNew={() => setView({ name: "new" })} />
        )}
      </main>
    </div>
  );
}
