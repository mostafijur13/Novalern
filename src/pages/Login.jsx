import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { firebaseConfigured } from "../lib/firebase";
import "./login.css";

const FRIENDLY = {
  "auth/invalid-credential": "That email and password don't match.",
  "auth/user-not-found": "No account with that email yet. Create one below.",
  "auth/wrong-password": "That email and password don't match.",
  "auth/email-already-in-use": "That email already has an account. Sign in instead.",
  "auth/weak-password": "Use at least 6 characters for the password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/popup-closed-by-user": "The Google window was closed before finishing.",
  "auth/operation-not-allowed": "This sign-in method isn't enabled in Firebase yet.",
};

export default function Login() {
  const { user, loading, signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Intro: 0 = mark centred, 1 = mark slides left and wordmark reveals, 2 = form in.
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const a = setTimeout(() => setStage(1), 700);
    const b = setTimeout(() => setStage(2), 1500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  const from = location.state?.from?.pathname || "/";
  if (!loading && user) return <Navigate to={from} replace />;

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      navigate(from, { replace: true });
    } catch (err) {
      setError(FRIENDLY[err.code] || err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    run(() => (mode === "signin" ? signIn(email, password) : signUp(name, email, password)));
  }

  return (
    <div className={`auth stage-${stage}`}>
      <Doodles />

      <main className="auth-card">
        <div className="brand">
          <img src="/icon.png" alt="" className="brand-mark" />
          <span className="brand-word" aria-label="novalern">
            <span className="w-nova">nova</span>
            <span className="w-lern">lern</span>
            <span className="w-dot">.</span>
          </span>
        </div>

        <div className="auth-body">
          <h1 className="auth-title">{mode === "signin" ? "Welcome back" : "Make an account"}</h1>
          <p className="auth-sub">
            {mode === "signin" ? "Pick up where you left off." : "Takes about thirty seconds."}
          </p>

          {!firebaseConfigured && (
            <p className="auth-error">Firebase isn't configured. Copy .env.example to .env and add your keys.</p>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}

          <form onSubmit={onSubmit} className="auth-form">
            {mode === "signup" && (
              <label className="field-line">
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </label>
            )}
            <label className="field-line">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label className="field-line">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                required
              />
            </label>

            <button className="auth-primary" disabled={busy || !firebaseConfigured}>
              {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="auth-or"><span>or</span></div>

          <button className="auth-google" type="button" disabled={busy || !firebaseConfigured} onClick={() => run(signInWithGoogle)}>
            <GoogleIcon /> Continue with Google
          </button>

          <p className="auth-switch">
            {mode === "signin" ? (
              <>New here? <button type="button" onClick={() => setMode("signup")}>Create an account</button></>
            ) : (
              <>Already have one? <button type="button" onClick={() => setMode("signin")}>Sign in</button></>
            )}
          </p>
        </div>
      </main>

      <footer className="auth-foot">Learn it today. Remember it all week.</footer>
    </div>
  );
}

/* Hand-drawn ink doodles scattered around the page. Hidden on small screens except two. */
function Doodles() {
  return (
    <svg className="doodles" viewBox="0 0 1200 800" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* open notebook, top left */}
      <g className="d d1" transform="translate(110 130)">
        <path d="M0 10 Q40 -4 80 10 L80 110 Q40 96 0 110 Z" />
        <path d="M80 10 Q120 -4 160 10 L160 110 Q120 96 80 110" />
        <path d="M14 36h50M14 54h50M14 72h36M96 36h50M96 54h40" strokeWidth="1.5" />
      </g>
      {/* lightbulb, right */}
      <g className="d d2" transform="translate(960 150)">
        <path d="M40 0a32 32 0 0 1 20 57c-6 5-8 11-8 18H28c0-7-2-13-8-18A32 32 0 0 1 40 0Z" />
        <path d="M30 86h20M32 96h16" />
        <path d="M40 -22v10M70 -8l-7 7M10 -8l7 7" strokeWidth="1.5" />
      </g>
      {/* paper plane with dotted trail, bottom left */}
      <g className="d d3" transform="translate(150 560)">
        <path d="M0 40 L120 0 L70 90 L52 54 Z" />
        <path d="M52 54 L120 0" />
        <path d="M-10 60 C-40 70 -60 90 -90 100" strokeDasharray="2 8" />
      </g>
      {/* squiggle, top centre-right */}
      <path className="d d4" d="M700 70c15-25 30 25 45 0s30 25 45 0 30 25 45 0" />
      {/* little sun / star, bottom right */}
      <g className="d d5" transform="translate(1010 580)">
        <circle cx="0" cy="0" r="14" />
        <path d="M0 -30v-10M0 30v10M30 0h10M-30 0h-10M21 -21l7-7M-21 21l-7 7M21 21l7 7M-21 -21l-7-7" strokeWidth="1.5" />
      </g>
      {/* checkbox list, left middle */}
      <g className="d d6" transform="translate(60 360)">
        <rect x="0" y="0" width="16" height="16" rx="3" /><path d="M4 8l4 4 6-7" /><path d="M26 8h60" strokeWidth="1.5" />
        <rect x="0" y="30" width="16" height="16" rx="3" /><path d="M4 38l4 4 6-7" /><path d="M26 38h48" strokeWidth="1.5" />
        <rect x="0" y="60" width="16" height="16" rx="3" /><path d="M26 68h56" strokeWidth="1.5" />
      </g>
      {/* speech bubble, right lower */}
      <g className="d d7" transform="translate(880 420)">
        <path d="M0 0h110a10 10 0 0 1 10 10v44a10 10 0 0 1-10 10H40l-22 18v-18H10A10 10 0 0 1 0 54V10A10 10 0 0 1 10 0Z" transform="translate(-10 0)" />
        <path d="M14 22h70M14 40h46" strokeWidth="1.5" />
      </g>
      {/* dotted block, bottom centre */}
      <g className="d d8" transform="translate(560 690)" fill="currentColor" stroke="none">
        {Array.from({ length: 4 }).flatMap((_, r) =>
          Array.from({ length: 7 }).map((_, c) => <circle key={`${r}-${c}`} cx={c * 14} cy={r * 14} r="1.6" />)
        )}
      </g>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.6-2 15.4-5.6l-7.5-5.8c-2.1 1.4-4.8 2.2-7.9 2.2-6.3 0-11.7-4.1-13.6-9.8l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
