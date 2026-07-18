import { FormEvent, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { isSupabaseConfigured } from "../lib/supabase";
import AuthFeaturesPanel from "./AuthFeaturesPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginPageProps {
  mode: "signin" | "signup";
}

function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page fixed inset-0 z-50 overflow-y-auto md:grid md:h-screen md:grid-cols-2 md:overflow-hidden">
      <AuthFeaturesPanel />
      <div className="flex items-center justify-center bg-muted/30 px-6 py-10 md:h-full md:overflow-y-auto md:px-12">
        <div className="w-full max-w-md py-4">{children}</div>
      </div>
    </div>
  );
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
      <AuthPageShell>
        <Card>
          <CardHeader>
            <CardTitle>Configuration required</CardTitle>
            <CardDescription>
              Supabase Auth is not configured for this environment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Missing environment variables</AlertTitle>
              <AlertDescription>
                Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your
                environment.
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-2">
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Back to app</Link>
            </Button>
          </CardFooter>
        </Card>
      </AuthPageShell>
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

  const isSignIn = mode === "signin";

  return (
    <AuthPageShell>
      <Card>
        <CardHeader>
          <CardTitle>{isSignIn ? "Sign in" : "Create account"}</CardTitle>
          <CardDescription>
            {isSignIn
              ? "Sync local data and get unlimited extractions."
              : "Save your schemas and documents to the cloud."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit} id="auth-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isSignIn ? "current-password" : "new-password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {message && (
              <Alert className="border-green-200 bg-green-50 text-green-900 [&>svg]:text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-4">
          <Button
            type="submit"
            form="auth-form"
            className="w-full"
            disabled={submitting}
          >
            {submitting
              ? "Please wait..."
              : isSignIn
                ? "Sign in"
                : "Sign up"}
          </Button>

          <div className="flex w-full flex-col items-center gap-2 text-center text-sm">
            {isSignIn ? (
              <Button asChild variant="link" className="h-auto p-0">
                <Link to="/signup">Need an account? Sign up</Link>
              </Button>
            ) : (
              <Button asChild variant="link" className="h-auto p-0">
                <Link to="/login">Already have an account? Sign in</Link>
              </Button>
            )}
            <Button asChild variant="ghost" className="h-auto text-muted-foreground">
              <Link to="/">Continue as guest</Link>
            </Button>
          </div>
        </CardFooter>
      </Card>
    </AuthPageShell>
  );
}
