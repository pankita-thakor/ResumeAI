import { FormEvent, useRef, useState } from "react";
import {
  askResume,
  askResumeById,
  askResumeFromPdf,
  indexResumePdf,
  indexResumeText,
  type AskMeta,
} from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { LogOut, FileText, Plus } from "lucide-react";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { showNotification } = useNotification();
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumePdf, setResumePdf] = useState<File | null>(null);
  const [resumeIndexedId, setResumeIndexedId] = useState<string | null>(null);
  const [indexSegments, setIndexSegments] = useState<number | null>(null);
  const [indexNote, setIndexNote] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [blockingMsg, setBlockingMsg] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [askMeta, setAskMeta] = useState<AskMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clearIndexedState() {
    setResumeIndexedId(null);
    setIndexSegments(null);
    setIndexNote(null);
  }

  function clearPdf() {
    setResumePdf(null);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    clearIndexedState();
    setAnswer(null);
    setAskMeta(null);
    setError(null);
  }

  async function handlePdfFile(file: File | null) {
    if (file) {
      setResumeText("");
    }
    setResumePdf(file);
    clearIndexedState();
    setAnswer(null);
    setAskMeta(null);
    setError(null);
    if (!file) return;

    setBlocking(true);
    setBlockingMsg("Indexing PDF — chunking, embedding, storing in Pinecone…");
    try {
      const out = await indexResumePdf(file);
      setResumeIndexedId(out.resumeId);
      setIndexSegments(out.segmentCount);
      setIndexNote(
        `Ready: ${out.segmentCount} segments stored in Pinecone (${out.embeddingModel}).`
      );
      showNotification('PDF indexed successfully!', 'success');
    } catch (err) {
      setIndexNote(null);
      const msg = err instanceof Error ? err.message : "Could not index PDF";
      setError(msg);
      showNotification(msg, 'error');
    } finally {
      setBlocking(false);
      setBlockingMsg("");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAnswer(null);
    setAskMeta(null);

    if (!question.trim()) {
      showNotification('Please enter a question.', 'warning');
      return;
    }

    if (!resumeIndexedId && !resumePdf && !resumeText.trim()) {
      showNotification('Please provide a resume.', 'warning');
      return;
    }

    setBlocking(true);
    try {
      let id = resumeIndexedId;

      if (!resumePdf && resumeText.trim() && !id) {
        setBlockingMsg("Indexing resume — chunking, embedding, storing in Pinecone…");
        try {
          const out = await indexResumeText(resumeText.trim());
          id = out.resumeId;
          setResumeIndexedId(out.resumeId);
          setIndexSegments(out.segmentCount);
          setIndexNote(
            `Ready: ${out.segmentCount} segments in Pinecone (${out.embeddingModel}).`
          );
          showNotification('Resume indexed!', 'success');
        } catch {
          setBlockingMsg("Generating answer from full resume (index unavailable)…");
          const res = await askResume(resumeText.trim(), question.trim());
          setAnswer(res.answer);
          setAskMeta(res.meta);
          return;
        }
      }

      if (id) {
        setBlockingMsg("Searching Pinecone, generating answer…");
        const res = await askResumeById(id, question.trim());
        setAnswer(res.answer);
        setAskMeta(res.meta);
      } else if (resumePdf) {
        setBlockingMsg("Extracting PDF text and generating answer…");
        const res = await askResumeFromPdf(resumePdf, question.trim());
        setAnswer(res.answer);
        setAskMeta(res.meta);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      showNotification(msg, 'error');
    } finally {
      setBlocking(false);
      setBlockingMsg("");
    }
  }

  const inputsLocked = blocking;

  return (
    <div className="app">
      {blocking && (
        <div
          className="loading-overlay"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="loading-overlay-card">
            <div className="loading-spinner" aria-hidden />
            <p>{blockingMsg || "Working…"}</p>
          </div>
        </div>
      )}

      <div className="app-shell">
        <header className="header">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              R
            </span>
            <div>
              <h1>Resume AI</h1>
              <p className="header-tagline">
                Logged in as {user?.email}
              </p>
            </div>
          </div>
          <button onClick={logout} className="logout-btn">
            <LogOut size={18} /> Logout
          </button>
        </header>

        <main className="main">
          <div className="sidebar">
            <h3>Your Resumes</h3>
            <div className="resume-list">
              {user?.resumes.map((r) => (
                <div 
                  key={r.resumeId} 
                  className={`resume-item ${resumeIndexedId === r.resumeId ? 'active' : ''}`}
                  onClick={() => {
                    setResumeIndexedId(r.resumeId);
                    setResumeText("");
                    setResumePdf(null);
                    setAnswer(null);
                    setError(null);
                    setIndexNote(`Selected: ${r.name}`);
                  }}
                >
                  <FileText size={16} />
                  <span>{r.name}</span>
                </div>
              ))}
              <div 
                className="resume-item add-new"
                onClick={() => {
                  setResumeIndexedId(null);
                  setResumeText("");
                  setResumePdf(null);
                  setIndexNote(null);
                }}
              >
                <Plus size={16} />
                <span>New Analysis</span>
              </div>
            </div>
          </div>

          <div className="dashboard-content">
            <div className="panel panel--input">
              <form className="form" onSubmit={onSubmit}>
                {!resumeIndexedId && (
                  <>
                    <div className="field-grow">
                      <label className="label" htmlFor="resume-text">
                        Resume (paste)
                      </label>
                      <textarea
                        id="resume-text"
                        className="textarea"
                        value={resumeText}
                        onChange={(e) => {
                          if (resumePdf) {
                            setResumePdf(null);
                            if (pdfInputRef.current) pdfInputRef.current.value = "";
                          }
                          setResumeText(e.target.value);
                          clearIndexedState();
                          setAnswer(null);
                          setAskMeta(null);
                          setError(null);
                        }}
                        placeholder="Paste full resume…"
                        disabled={inputsLocked}
                        autoComplete="off"
                      />
                    </div>

                    <label className="label" htmlFor="resume-pdf">
                      Or upload PDF
                    </label>
                    <div className="row-inline">
                      <input
                        id="resume-pdf"
                        ref={pdfInputRef}
                        className="file-input"
                        type="file"
                        accept="application/pdf"
                        disabled={inputsLocked}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          void handlePdfFile(f);
                        }}
                      />
                      {resumePdf && (
                        <button
                          type="button"
                          className="linkish"
                          onClick={clearPdf}
                          disabled={inputsLocked}
                        >
                          Clear PDF
                        </button>
                      )}
                    </div>
                  </>
                )}

                <p className="source-hint" aria-live="polite">
                  {resumePdf ? (
                    <>
                      <strong>AI uses:</strong> PDF{" "}
                      <span className="source-name">{resumePdf.name}</span>
                      {resumeIndexedId ? (
                        <span className="source-indexed-tag"> (indexed)</span>
                      ) : null}
                    </>
                  ) : resumeIndexedId ? (
                    <>
                      <strong>AI uses:</strong>{" "}
                      {indexNote?.startsWith("Selected: ") ? (
                        <span className="source-name">
                          {indexNote.slice("Selected: ".length).trim()}
                        </span>
                      ) : (
                        "Indexed resume — pick from sidebar or add a new file"
                      )}
                    </>
                  ) : resumeText.trim() ? (
                    <>
                      <strong>AI uses:</strong> pasted text{" "}
                      <span className="source-name">
                        ({resumeText.length.toLocaleString()} chars)
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>AI uses:</strong> add paste or PDF.
                    </>
                  )}
                </p>

                {indexNote && <p className="banner info">{indexNote}</p>}

                <label className="label" htmlFor="question">
                  Question
                </label>
                <input
                  id="question"
                  className="input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. What years did they work at Acme?"
                  required
                  disabled={inputsLocked}
                />

                <button className="btn" type="submit" disabled={inputsLocked}>
                  {blocking ? "Working…" : "Get answer"}
                </button>
              </form>
            </div>

            <div className="panel panel--output">
              <h2 className="panel-title">Answer</h2>
              <div className="panel-body">
                {error && <div className="banner error">{error}</div>}

                {answer == null && !error && (
                  <p className="answer-placeholder">
                    Your answer appears here.
                  </p>
                )}

                {answer != null && (
                  <section className="answer">
                    {askMeta && (
                      <p className="answer-meta">
                        {askMeta.answerFromCache && <strong>Cache hit. </strong>}
                        {askMeta.usedEmbeddings ? (
                          <>
                            Top {askMeta.similarChunksSelected} sections.
                          </>
                        ) : "Full resume used."}
                      </p>
                    )}
                    <pre className="answer-body">{answer}</pre>
                  </section>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
