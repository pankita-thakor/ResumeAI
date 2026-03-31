import { FormEvent, useRef, useState } from "react";
import {
  askResume,
  askResumeById,
  askResumeFromPdf,
  indexResumePdf,
  indexResumeText,
  type AskMeta,
} from "./services/api";
import "./App.css";

export default function App() {
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
    } catch (err) {
      setIndexNote(null);
      setError(err instanceof Error ? err.message : "Could not index PDF");
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
      setError("Enter a question.");
      return;
    }

    if (!resumeIndexedId && !resumePdf && !resumeText.trim()) {
      setError("Paste resume text or upload a PDF.");
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
        } catch {
          setBlockingMsg("Generating answer from full resume (index unavailable)…");
          const res = await askResume(resumeText.trim(), question.trim());
          setAnswer(res.answer);
          setAskMeta(res.meta);
          return;
        }
      }

      if (id) {
        setBlockingMsg("Embedding your question, searching Pinecone, generating answer…");
        const res = await askResumeById(id, question.trim());
        setAnswer(res.answer);
        setAskMeta(res.meta);
      } else if (resumePdf) {
        setBlockingMsg("Extracting PDF text and generating answer…");
        const res = await askResumeFromPdf(resumePdf, question.trim());
        setAnswer(res.answer);
        setAskMeta(res.meta);
      } else {
        setError("Nothing to ask against. Paste text or upload a PDF.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
                One source at a time — paste or PDF. Get answer indexes paste automatically,
                then queries Pinecone + LLM. Fits your screen: scroll only inside the boxes.
              </p>
            </div>
          </div>
        </header>

        <main className="main">
          <div className="panel panel--input">
            <form className="form" onSubmit={onSubmit}>
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
                Or PDF
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
              {resumePdf && (
                <p className="file-note">File: {resumePdf.name}</p>
              )}

              <p className="source-hint" aria-live="polite">
                {resumePdf ? (
                  <>
                    <strong>AI uses:</strong> PDF{" "}
                    <span className="source-name">{resumePdf.name}</span>
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
                    <strong>AI uses:</strong> add paste or PDF (one at a time).
                  </>
                )}
              </p>

              {resumeIndexedId && (
                <p className="index-chip">
                  <strong>Indexed</strong>{" "}
                  <code className="resume-id">{resumeIndexedId.slice(0, 14)}…</code>
                  {indexSegments != null && <> · {indexSegments} segments</>}
                </p>
              )}
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
                  Your answer appears here. On desktop the page stays fixed and this column scrolls;
                  on mobile you can scroll the whole page.
                </p>
              )}

              {answer != null && (
                <section className="answer">
                  {askMeta && (
                    <p className="answer-meta">
                      {askMeta.resumeId && (
                        <>
                          <strong>Indexed:</strong>{" "}
                          <code>{askMeta.resumeId.slice(0, 10)}…</code>
                          {" · "}
                        </>
                      )}
                      {askMeta.answerFromCache && (
                        <>
                          <strong>Answer cache hit.</strong>{" "}
                        </>
                      )}
                      {!askMeta.answerFromCache &&
                        askMeta.embeddingVectorCacheHits != null &&
                        askMeta.embeddingVectorCacheMisses != null &&
                        askMeta.usedEmbeddings && (
                          <>
                            Embeddings cache: {askMeta.embeddingVectorCacheHits}H /{" "}
                            {askMeta.embeddingVectorCacheMisses}M ·{" "}
                          </>
                        )}
                      {askMeta.usedEmbeddings ? (
                        <>
                          Top {askMeta.similarChunksSelected} sections ({askMeta.totalChunks}{" "}
                          total). {askMeta.embeddingModel ?? "default"}
                          {askMeta.vectorStore === "pinecone" && " · Pinecone"}
                          {askMeta.vectorStore === "memory" && " · in-memory rank"}
                          .
                        </>
                      ) : askMeta.totalChunks > 0 ? (
                        <>
                          Full resume in prompt ({askMeta.totalChunks} sections).
                        </>
                      ) : null}
                    </p>
                  )}
                  <pre className="answer-body">{answer}</pre>
                </section>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
