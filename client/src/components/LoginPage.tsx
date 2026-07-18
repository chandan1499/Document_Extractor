import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isSupabaseConfigured } from "../lib/supabase";
import "../styles/LoginPage.css";

interface LoginPageProps {
  mode: "signin" | "signup";
}

export default function LoginPage({ mode }: LoginPageProps) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isSupabaseConfigured()) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Document Extraction</h1>
          <p className="login-error">
            Supabase Auth is not configured. Set VITE_SUPABASE_URL and
            VITE_SUPABASE_ANON_KEY in your environment.
          </p>
          <Link to="/" className="login-toggle">
            Back to app
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
        const from =
          (location.state as { from?: { pathname?: string } } | null)?.from
            ?.pathname ?? "/";
        navigate(from, { replace: true });
      } else {
        await signUp(email.trim(), password);
        setMessage(
          "Account created. Check your email to confirm, then sign in."
        );
        navigate("/login", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Document Extraction</h1>
        <p className="login-subtitle">
          {mode === "signin"
            ? "Sign in to sync local data and get unlimited extractions."
            : "Create an account to save your schemas and documents to the cloud."}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && <p className="login-error">{error}</p>}
          {message && <p className="login-message">{message}</p>}

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting
              ? "Please wait..."
              : mode === "signin"
                ? "Sign in"
                : "Sign up"}
          </button>
        </form>

        {mode === "signin" ? (
          <Link to="/signup" className="login-toggle">
            Need an account? Sign up
          </Link>
        ) : (
          <Link to="/login" className="login-toggle">
            Already have an account? Sign in
          </Link>
        )}

        <Link to="/" className="login-toggle">
          Continue as guest
        </Link>
      </div>
    </div>
  );
}
