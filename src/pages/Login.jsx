import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { useAuth } from "../context/AuthContext";
import { firebaseConfigured } from "../lib/firebase";

const FRIENDLY = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/user-not-found": "No account with that email. Sign up instead.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/email-already-in-use": "That email already has an account. Sign in instead.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-email": "That email address does not look right.",
  "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
  "auth/operation-not-allowed": "This sign-in method is not enabled in the Firebase console.",
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
    <div className="login-page">
      <aside className="login-side">
        <img src="/icon.png" alt="" width="64" style={{ borderRadius: 16, marginBottom: 24 }} />
        <h1>Learn it today. Remember it all week.</h1>
        <p>Novalern turns your class notes and problems into lessons, daily exams and weekly recaps.</p>
        <ul>
          <li>Upload a photo or PDF of your lesson and learn with AI</li>
          <li>Speak or type your questions</li>
          <li>Daily exams: multiple choice, written or voice</li>
          <li>Weekly recap on the topics you studied</li>
        </ul>
      </aside>

      <main className="login-main">
        <div className="card login-card">
          <img src="/logo.png" alt="novalern." style={{ height: 36, marginBottom: 16 }} />
          <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p className="muted">
            {mode === "signin" ? "Sign in to continue learning." : "It takes less than a minute."}
          </p>

          {!firebaseConfigured && (
            <ErrorBanner message="Firebase is not configured. Copy .env.example to .env and fill in your project keys." />
          )}
          <ErrorBanner message={error} onClose={() => setError("")} />

          <form onSubmit={onSubmit}>
            {mode === "signup" && (
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" className="input" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="btn primary" style={{ width: "100%" }} disabled={busy || !firebaseConfigured}>
              {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Sign up"}
            </button>
          </form>

          <div className="divider">or</div>
          <button className="btn ghost" style={{ width: "100%" }} disabled={busy || !firebaseConfigured} onClick={() => run(signInWithGoogle)}>
            <GoogleIcon /> Continue with Google
          </button>

          <p className="muted small" style={{ marginTop: 18, textAlign: "center" }}>
            {mode === "signin" ? (
              <>
                New here?{" "}
                <button type="button" className="link-btn" onClick={() => setMode("signup")}>Create an account</button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" className="link-btn" onClick={() => setMode("signin")}>Sign in</button>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
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
