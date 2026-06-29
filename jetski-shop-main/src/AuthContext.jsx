import { createContext, useContext, useEffect, useState } from "react";
import { supabase, C, DISPLAY, BODY } from "./lib/supabase";
import { TextInput, Label, btn, Card } from "./lib/ui";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
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
  if (recovery) return <ResetPasswordScreen onDone={() => setRecovery(false)} />;
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
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setErr(""); setMsg(""); setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) setErr(error.message);
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email: f.email, password: f.password,
        options: { data: { display_name: f.name.trim() || f.email.split("@")[0] } },
      });
      if (error) setErr(error.message);
      else setMsg("Account created. Ask a manager to approve you, then sign in.");
    }
    setBusy(false);
  }

  async function sendReset() {
    if (!f.email) { setErr("Enter your email first."); return; }
    setErr(""); setMsg(""); setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(f.email, { redirectTo: window.location.origin });
    setBusy(false);
    if (error) setErr(error.message);
    else setMsg("Check your email for a reset link. Opening it brings you back here to set a new password.");
  }

  const title = mode === "reset" ? "Reset password" : "Shop sign in";
  const subtitle = mode === "login" ? "Welcome back."
    : mode === "signup" ? "New accounts need manager approval before they can see shop data."
    : "We'll email you a link to set a new password.";

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 700, textTransform: "uppercase", color: C.ink, letterSpacing: "0.04em" }}>
          {title}
        </div>
        <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginTop: 4 }}>{subtitle}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {mode === "signup" && <div><Label>Your name</Label><TextInput value={f.name} onChange={set("name")} placeholder="Mike R." /></div>}
          <div><Label>Email</Label><TextInput type="email" value={f.email} onChange={set("email")} placeholder="you@shop.com" onKeyDown={(e) => e.key === "Enter" && mode === "reset" && sendReset()} /></div>
          {mode !== "reset" && <div><Label>Password</Label><TextInput type="password" value={f.password} onChange={set("password")} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>}

          {err && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY }}>{err}</div>}
          {msg && <div style={{ fontSize: 12, color: C.teal, fontFamily: BODY, fontWeight: 600 }}>{msg}</div>}

          {mode === "reset" ? (
            <button onClick={sendReset} disabled={busy || !f.email} style={{ ...btn(C.orange), opacity: busy || !f.email ? 0.6 : 1 }}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          ) : (
            <button onClick={submit} disabled={busy || !f.email || !f.password} style={{ ...btn(C.orange), opacity: busy ? 0.6 : 1 }}>
              {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          )}

          {mode === "login" && (
            <button onClick={() => { setMode("reset"); setErr(""); setMsg(""); }} style={{ fontSize: 13, color: C.teal, fontFamily: BODY, fontWeight: 600 }}>
              Forgot password?
            </button>
          )}
          {mode === "reset" ? (
            <button onClick={() => { setMode("login"); setErr(""); setMsg(""); }} style={{ fontSize: 13, color: C.teal, fontFamily: BODY, fontWeight: 600 }}>
              ← Back to sign in
            </button>
          ) : (
            <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); setMsg(""); }} style={{ fontSize: 13, color: C.teal, fontFamily: BODY, fontWeight: 600 }}>
              {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

function ResetPasswordScreen({ onDone }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    if (pw.length < 6) { setErr("Use at least 6 characters."); return; }
    if (pw !== pw2) { setErr("Passwords don't match."); return; }
    setErr(""); setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setErr(error.message);
    else setDone(true);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 700, textTransform: "uppercase", color: C.ink }}>Set a new password</div>
        {done ? (
          <>
            <p style={{ fontSize: 14, color: C.slate, fontFamily: BODY, marginTop: 8 }}>Your password's updated — you're all set.</p>
            <button onClick={onDone} style={{ ...btn(C.orange), marginTop: 14 }}>Continue to the app</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: C.slate, fontFamily: BODY, marginTop: 4 }}>Choose a new password for your account.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              <div><Label>New password</Label><TextInput type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
              <div><Label>Confirm password</Label><TextInput type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
              {err && <div style={{ fontSize: 12, color: C.red, fontFamily: BODY }}>{err}</div>}
              <button onClick={save} disabled={busy || !pw || !pw2} style={{ ...btn(C.orange), opacity: busy || !pw || !pw2 ? 0.6 : 1 }}>
                {busy ? "Saving…" : "Save password"}
              </button>
            </div>
          </>
        )}
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
