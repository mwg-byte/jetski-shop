import { createContext, useContext, useEffect, useState } from "react";
import { supabase, C, DISPLAY, BODY } from "./lib/supabase";
import { TextInput, Label, btn, Card } from "./lib/ui";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    supabase.from("profiles").select("*").eq("id", session.user.id).single()
      .then(({ data }) => setProfile(data ?? null));
  }, [session?.user?.id]);

  const value = { session, profile, refreshProfile: async () => {
    if (!session) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    setProfile(data ?? null);
  }};

  if (session === undefined) return <Center>Loading…</Center>;
  if (!session) return <LoginScreen />;
  if (!profile) return <Center>Loading your profile…</Center>;
  if (!profile.active) return <PendingScreen profile={profile} />;
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function Center({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.slate, fontFamily: BODY, fontSize: 14 }}>
      {children}
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setErr(""); setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) setErr(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email: f.email, password: f.password,
        options: { data: { display_name: f.name.trim() || f.email.split("@")[0] } },
      });
      if (error) setErr(error.message);
      else setErr("Account created. Ask a manager to approve you, then sign in.");
    }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 700, textTransform: "uppercase", color: C.ink, letterSpacing: "0.04em" }}>
          Shop sign in
        </div>
        <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginTop: 4 }}>
          {mode === "login" ? "Welcome back." : "New accounts need manager approval before they can see shop data."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {mode === "signup" && <div><Label>Your name</Label><TextInput value={f.name} onChange={set("name")} placeholder="Mike R." /></div>}
          <div><Label>Email</Label><TextInput type="email" value={f.email} onChange={set("email")} placeholder="you@shop.com" /></div>
          <div><Label>Password</Label><TextInput type="password" value={f.password} onChange={set("password")} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
          {err && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY }}>{err}</div>}
          <button onClick={submit} disabled={busy || !f.email || !f.password} style={{ ...btn(C.orange), opacity: busy ? 0.6 : 1 }}>
            {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); }} style={{ fontSize: 13, color: C.teal, fontFamily: BODY, fontWeight: 600 }}>
            {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function PendingScreen({ profile }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Card style={{ maxWidth: 380, textAlign: "center" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, textTransform: "uppercase", color: C.ink }}>
          Hang tight, {profile.display_name}
        </div>
        <p style={{ fontSize: 14, color: C.slate, fontFamily: BODY, marginTop: 8 }}>
          Your account is waiting for a manager to approve it. Once they activate you in the Crew screen, sign in again and you're in.
        </p>
        <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 16, fontSize: 13, color: C.teal, fontFamily: BODY, fontWeight: 600 }}>
          Sign out
        </button>
      </Card>
    </div>
  );
}
