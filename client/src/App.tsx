import { useState } from "react";
import { ExtractedDocument } from "./types/index";
import UploadArea from "./components/UploadArea";
import ReviewPanel from "./components/ReviewPanel";
import DocumentList from "./components/DocumentList";
import "./App.css";

type AppView = "upload" | "review" | "list";

export default function App() {
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
        <h1>📄 Document Extraction</h1>
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
        </nav>
      </header>

      <main className="app-main">
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
      </main>

      <footer className="app-footer">
        <p>Document Extraction App • Built with React + Express</p>
      </footer>
    </div>
  );
}
