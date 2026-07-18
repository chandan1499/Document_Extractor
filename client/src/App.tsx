import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router-dom";
import { ExtractedDocument } from "./types/index";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SchemasProvider } from "./context/SchemasContext";
import { StorageProvider } from "./storage/StorageContext";
import LoginPage from "./components/LoginPage";
import "./App.css";
import "./styles/LoginPage.css";

const UploadArea = lazy(() => import("./components/UploadArea"));
const ReviewPanel = lazy(() => import("./components/ReviewPanel"));
const DocumentList = lazy(() => import("./components/DocumentList"));
const SchemaManager = lazy(() => import("./components/SchemaManager"));

interface UploadOutletContext {
  onDocumentExtracted: (doc: ExtractedDocument) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

function ViewLoading() {
  return (
    <div className="view-loading">
      <p>Loading...</p>
    </div>
  );
}

function UploadRoute() {
  const { onDocumentExtracted, loading, setLoading } =
    useOutletContext<UploadOutletContext>();

  return (
    <UploadArea
      onDocumentExtracted={onDocumentExtracted}
      loading={loading}
      setLoading={setLoading}
    />
  );
}

function AppLayout() {
  const { user, session, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [currentDoc, setCurrentDoc] = useState<ExtractedDocument | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);

  useEffect(() => {
    setCurrentDoc(null);
  }, [location.pathname]);

  const handleDocumentExtracted = (doc: ExtractedDocument) => {
    setCurrentDoc(doc);
  };

  const handleDocumentSaved = () => {
    setCurrentDoc(null);
    navigate("/documents");
  };

  const handleBackToList = () => {
    setCurrentDoc(null);
    navigate("/documents");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="auth-loading">
        <p>Loading...</p>
      </div>
    );
  }

  const outletContext: UploadOutletContext = {
    onDocumentExtracted: handleDocumentExtracted,
    loading: extractLoading,
    setLoading: setExtractLoading,
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <h1>📄 Document Extraction</h1>
          <div className="app-user-menu">
            {session ? (
              <>
                <span className="app-user-email">{user?.email}</span>
                <button
                  type="button"
                  className="logout-btn"
                  onClick={() => void handleSignOut()}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="auth-link">
                  Log in
                </NavLink>
                <NavLink to="/signup" className="auth-link auth-link-primary">
                  Sign up
                </NavLink>
              </>
            )}
          </div>
        </div>
        <nav className="app-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `nav-btn ${isActive && !currentDoc ? "active" : ""}`
            }
          >
            Upload
          </NavLink>
          <NavLink
            to="/documents"
            className={({ isActive }) =>
              `nav-btn ${isActive && !currentDoc ? "active" : ""}`
            }
          >
            Documents
          </NavLink>
          {session ? (
            <NavLink
              to="/schemas"
              className={({ isActive }) =>
                `nav-btn ${isActive && !currentDoc ? "active" : ""}`
              }
            >
              Schemas
            </NavLink>
          ) : (
            <span
              className="nav-btn nav-btn-disabled"
              aria-disabled="true"
              aria-label="Schemas — sign in required"
            >
              <span className="nav-btn-disabled-content">
                <span className="nav-btn-disabled-label">
                  <span className="nav-btn-auth-icon" aria-hidden="true">
                    🔒
                  </span>
                  Schemas
                </span>
                <span className="nav-btn-disabled-hint">Sign in to access</span>
              </span>
            </span>
          )}
        </nav>
      </header>

      <main className="app-main">
        <Suspense fallback={<ViewLoading />}>
          {currentDoc ? (
            <ReviewPanel
              document={currentDoc}
              onSaved={handleDocumentSaved}
              onCancel={handleBackToList}
            />
          ) : (
            <Outlet context={outletContext} />
          )}
        </Suspense>
      </main>

      <footer className="app-footer">
        <p>Document Extraction App • Built with React + Express</p>
      </footer>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading">
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

function GuestOnlyLogin({ mode }: { mode: "signin" | "signup" }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="auth-loading">
        <p>Loading...</p>
      </div>
    );
  }
  if (session) {
    return <Navigate to="/" replace />;
  }
  return <LoginPage mode={mode} />;
}

export default function App() {
  return (
    <AuthProvider>
      <StorageProvider>
        <SchemasProvider>
          <Routes>
            <Route path="/login" element={<GuestOnlyLogin mode="signin" />} />
            <Route path="/signup" element={<GuestOnlyLogin mode="signup" />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<UploadRoute />} />
              <Route path="/documents" element={<DocumentList />} />
              <Route path="/schemas" element={
                <RequireAuth>
                  <SchemaManager />
                </RequireAuth>
              } />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SchemasProvider>
      </StorageProvider>
    </AuthProvider>
  );
}
