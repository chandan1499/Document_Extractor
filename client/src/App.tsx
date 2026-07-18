import { lazy, Suspense, useState } from "react";
import { ExtractedDocument } from "./types/index";
import AuthGate from "./components/AuthGate";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SchemasProvider } from "./context/SchemasContext";
import "./App.css";
import "./styles/LoginPage.css";

const UploadArea = lazy(() => import("./components/UploadArea"));
const ReviewPanel = lazy(() => import("./components/ReviewPanel"));
const DocumentList = lazy(() => import("./components/DocumentList"));
const SchemaManager = lazy(() => import("./components/SchemaManager"));

type AppView = "upload" | "review" | "list" | "schemas";

function ViewLoading() {
  return (
    <div className="view-loading">
      <p>Loading...</p>
    </div>
  );
}

function AppContent() {
  const { user, signOut } = useAuth();
  const [view, setView] = useState<AppView>("upload");
  const [currentDoc, setCurrentDoc] = useState<ExtractedDocument | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDocumentExtracted = (doc: ExtractedDocument) => {
    setCurrentDoc(doc);
    setView("review");
  };

  const handleDocumentSaved = () => {
    setCurrentDoc(null);
    setView("list");
  };

  const handleBackToList = () => {
    setView("list");
    setCurrentDoc(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <h1>📄 Document Extraction</h1>
          <div className="app-user-menu">
            <span className="app-user-email">{user?.email}</span>
            <button type="button" className="logout-btn" onClick={() => signOut()}>
              Log out
            </button>
          </div>
        </div>
        <nav className="app-nav">
          <button
            className={`nav-btn ${view === "upload" ? "active" : ""}`}
            onClick={() => setView("upload")}
          >
            Upload
          </button>
          <button
            className={`nav-btn ${view === "list" ? "active" : ""}`}
            onClick={() => setView("list")}
          >
            Documents
          </button>
          <button
            className={`nav-btn ${view === "schemas" ? "active" : ""}`}
            onClick={() => setView("schemas")}
          >
            Schemas
          </button>
        </nav>
      </header>

      <main className="app-main">
        <Suspense fallback={<ViewLoading />}>
          {view === "upload" && (
            <UploadArea
              onDocumentExtracted={handleDocumentExtracted}
              loading={loading}
              setLoading={setLoading}
            />
          )}

          {view === "review" && currentDoc && (
            <ReviewPanel
              document={currentDoc}
              onSaved={handleDocumentSaved}
              onCancel={handleBackToList}
            />
          )}

          {view === "list" && <DocumentList />}

          {view === "schemas" && <SchemaManager />}
        </Suspense>
      </main>

      <footer className="app-footer">
        <p>Document Extraction App • Built with React + Express</p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <SchemasProvider>
          <AppContent />
        </SchemasProvider>
      </AuthGate>
    </AuthProvider>
  );
}
