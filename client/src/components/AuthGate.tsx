import { lazy, ReactNode, Suspense } from "react";
import { useAuth } from "../context/AuthContext";

const LoginPage = lazy(() => import("./LoginPage"));

export default function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <Suspense
        fallback={
          <div className="auth-loading">
            <p>Loading...</p>
          </div>
        }
      >
        <LoginPage />
      </Suspense>
    );
  }

  return <>{children}</>;
}
