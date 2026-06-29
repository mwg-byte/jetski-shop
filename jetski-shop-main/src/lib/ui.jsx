import React from "react";
import { C, stageOf } from "./supabase";

const BODY = "Inter, system-ui, sans-serif";

export const inputStyle = {
fontFamily: BODY, border: `1px solid #ddd`, background: "#FBFCFD",
color: "#222", borderRadius: 6, padding: "8px 12px", fontSize: 14, width: "100%", outline: "none"
};

export const btn = (bg, color = "#fff") => ({
background: bg, color, fontFamily: BODY, fontWeight: 700, fontSize: 14, padding: "8px 16px", borderRadius: 6
});

export const btnSm = (bg, color = "#fff") => ({ ...btn(bg, color), fontSize: 12, padding: "4px 10px" });

export function TextInput(props) {
return <input {...props} style={{ ...inputStyle, ...props.style }} />;
}

export function Select({ children, ...props }) {
return <select {...props} style={{ ...inputStyle, ...props.style }}>{children}</select>;
}

export function Label({ children }) {
return <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{children}</div>;
}

export function SectionTitle({ children }) {
return <h3 style={{ fontSize: 18, fontWeight: 700, textTransform: "uppercase" }}>{children}</h3>;
}

export function StatusChip({ status, big }) {
const s = stageOf(status);
return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, fontWeight: big ? 600 : 500, padding: big ? "4px 12px" : "2px 8px", fontSize: big ? 14 : 12, background: s.color + "1A", color: s.color }}>{s.label}</span>;
}

export function Card({ children, style }) {
return <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: 18, ...style }}>{children}</div>;
}

export function Row({ children, style }) {
return <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", ...style }}>{children}</div>;
}

export function LiveDot({ color = "#34D399" }) {
return <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />;
}
// Cache bust
