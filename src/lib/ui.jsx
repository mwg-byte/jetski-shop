import { C, DISPLAY, BODY, stageOf } from "./supabase";

export const inputStyle = {
  fontFamily: BODY, border: `1px solid ${C.line}`, background: "#FBFCFD",
  color: C.ink, borderRadius: 6, padding: "8px 12px", fontSize: 14, width: "100%", outline: "none",
};

export const btn = (bg, color = "#fff") => ({
  background: bg, color, fontFamily: BODY, fontWeight: 700, fontSize: 14,
  padding: "8px 16px", borderRadius: 6,
});
export const btnSm = (bg, color = "#fff") => ({ ...btn(bg, color), fontSize: 12, padding: "6px 12px" });

export function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />;
}

export function Select({ children, ...props }) {
  return <select {...props} style={{ ...inputStyle, ...props.style }}>{children}</select>;
}

export function Label({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, color: C.slate, fontFamily: BODY }}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: DISPLAY, color: C.ink }}>{children}</h3>
      {right}
    </div>
  );
}

export function StatusChip({ status, big }) {
  const s = stageOf(status);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, fontWeight: 600,
      padding: big ? "4px 12px" : "2px 8px", fontSize: big ? 14 : 12,
      background: s.color + "1A", color: s.color, fontFamily: BODY,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.color }} />
      {s.label}
    </span>
  );
}

export function Card({ children, style }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 18, boxShadow: "0 1px 2px rgba(12,34,51,0.06)", ...style }}>
      {children}
    </div>
  );
}

export function Row({ children, style }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", ...style }}>{children}</div>;
}

export function LiveDot({ color = "#34D399" }) {
  return <span className="pulse" style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block", animation: "pulse 1.5s infinite" }} />;
}

/* one-time keyframes */
if (typeof document !== "undefined" && !document.getElementById("shop-anim")) {
  const s = document.createElement("style");
  s.id = "shop-anim";
  s.textContent = "@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.35 } }";
  document.head.appendChild(s);
}
export { TextInput, Select, Label, SectionTitle, StatusChip, Card, Row, LiveDot, inputStyle, btn, btnSm };
