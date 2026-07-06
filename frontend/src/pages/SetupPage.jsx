import { useState } from "react";
import FileDropZone from "../components/FileDropZone.jsx";
import ParsePreview from "../components/ParsePreview.jsx";

const DIFFICULTIES = [
  { value: "junior",    label: "Junior",    desc: "0–2 yrs · fundamentals" },
  { value: "mid",       label: "Mid",       desc: "2–5 yrs · applied skills" },
  { value: "senior",    label: "Senior",    desc: "5–10 yrs · depth + design" },
  { value: "principal", label: "Principal", desc: "10+ yrs · architecture + leadership" },
];

function Nav() {
  return (
    <nav style={{ borderBottom: "1px solid var(--border)", padding: "0 32px", height: 56,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "var(--bg2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, background: "var(--accent)", borderRadius: 7,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 700, color: "#fff" }}>I</div>
        <span style={{ fontWeight: 600, fontSize: 15 }}>InterviewIQ</span>
        <span style={{ color: "var(--text-3)", fontSize: 13, marginLeft: 4 }}>HR Setup</span>
      </div>
      <span className="badge badge-accent">HR portal</span>
    </nav>
  );
}

// ── Share link panel — shown after session is created ─────────────────────────
function SharePanel({ sessionId, candidateName, roleTitle, difficulty, onReset }) {
  const interviewUrl = `${window.location.origin}/interview/${sessionId}`;
  const monitorUrl   = `${window.location.origin}/monitor/${sessionId}`;
  const reportUrl    = `${window.location.origin}/report/${sessionId}`;
  const [copiedInterview, setCopiedInterview] = useState(false);
  const [copiedMonitor,   setCopiedMonitor]   = useState(false);

  function copy(text, setCopied) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px" }}>
      {/* Success header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Interview session ready</h1>
        <p style={{ color: "var(--text-2)", fontSize: 15 }}>
          {candidateName} · {roleTitle} · {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} level
        </p>
      </div>

      {/* Candidate link */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>👤</span>
          <p style={{ fontWeight: 500, fontSize: 15 }}>Candidate interview link</p>
          <span className="badge badge-success" style={{ marginLeft: "auto", fontSize: 11 }}>
            Send this to the candidate
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.6 }}>
          Share this link with the candidate. They will see only the interview room — no analysis,
          no scores, no gap data.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1, background: "var(--bg3)", borderRadius: "var(--radius)",
                        padding: "10px 14px", fontSize: 13, color: "var(--text-2)",
                        fontFamily: "var(--mono)", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {interviewUrl}
          </div>
          <button className="btn btn-primary" onClick={() => copy(interviewUrl, setCopiedInterview)}
            style={{ flexShrink: 0, padding: "10px 18px", fontSize: 13 }}>
            {copiedInterview ? "✓ Copied!" : "Copy link"}
          </button>
        </div>
      </div>

      {/* HR links */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>🎛</span>
          <p style={{ fontWeight: 500, fontSize: 15 }}>Your HR links</p>
          <span className="badge badge-accent" style={{ marginLeft: "auto", fontSize: 11 }}>
            Keep these private
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Monitor */}
          <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                          gap: 10, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>Live monitor</p>
                <p style={{ fontSize: 12, color: "var(--text-3)" }}>
                  Watch live transcript + scores during the interview
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button className="btn btn-ghost" onClick={() => copy(monitorUrl, setCopiedMonitor)}
                  style={{ fontSize: 12, padding: "7px 14px" }}>
                  {copiedMonitor ? "✓ Copied" : "Copy"}
                </button>
                <a href={monitorUrl} target="_blank" rel="noreferrer"
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: "7px 14px", textDecoration: "none",
                            color: "var(--text-2)" }}>
                  Open ↗
                </a>
              </div>
            </div>
          </div>

          {/* Report — shown after interview */}
          <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                          gap: 10, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>Eligibility report</p>
                <p style={{ fontSize: 12, color: "var(--text-3)" }}>
                  Available after the interview is complete
                </p>
              </div>
              <a href={reportUrl} target="_blank" rel="noreferrer"
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "7px 14px", textDecoration: "none",
                          color: "var(--text-2)", flexShrink: 0 }}>
                Open report ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "16px 20px",
                    marginBottom: 28 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)", marginBottom: 10 }}>
          HOW TO RUN THIS INTERVIEW
        </p>
        {[
          "Copy the candidate link above and send it via email or chat",
          "Open the Live monitor in a separate tab to watch in real time",
          "The candidate clicks their link, grants mic permission, and begins",
          "After they finish, open the Eligibility report for the full analysis",
        ].map((step, i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "flex-start" }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent-dim)",
                            color: "var(--accent)", fontSize: 11, fontWeight: 600, display: "flex",
                            alignItems: "center", justifyContent: "center", flexShrink: 0,
                            marginTop: 1 }}>{i + 1}</span>
            <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>{step}</p>
          </div>
        ))}
      </div>

      <button className="btn btn-ghost" onClick={onReset}
        style={{ width: "100%", justifyContent: "center", padding: 12, fontSize: 14 }}>
        ← Set up a new interview
      </button>
    </div>
  );
}

// ── Main setup page ───────────────────────────────────────────────────────────
export default function SetupPage() {
  const [jdFile,     setJdFile]     = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [difficulty, setDifficulty] = useState("mid");
  const [loading,    setLoading]    = useState(false);
  const [starting,   setStarting]   = useState(false);
  const [error,      setError]      = useState(null);
  const [result,     setResult]     = useState(null);
  const [session,    setSession]    = useState(null); // set after session created

  const canParse = jdFile && resumeFile && !loading && !starting;

  async function handleParse() {
    setLoading(true); setError(null); setResult(null);
    const form = new FormData();
    form.append("jd", jdFile);
    form.append("resume", resumeFile);
    // Retry once on network-level failures (ECONNRESET on first request after backend restart)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res  = await fetch("/api/parse", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Parse failed");
        setResult(data);
        setLoading(false);
        return;
      } catch (e) {
        const isNetworkError = e instanceof TypeError && e.message.toLowerCase().includes("fetch");
        if (attempt === 0 && isNetworkError) {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        setError(e.message);
        break;
      }
    }
    setLoading(false);
  }

  async function handleStartInterview() {
    if (!result) return;
    setStarting(true); setError(null);
    const body = JSON.stringify({
      jdText:        result.jd.raw,
      resumeText:    result.resume.raw,
      jdSummary:     result.jd.summary,
      resumeSummary: result.resume.summary,
      difficulty,
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res  = await fetch("/api/session/start", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to start session");
        setSession({ ...data, roleTitle: result.jd.summary?.role_title || "Interview" });
        setStarting(false);
        return;
      } catch (e) {
        const isNetworkError = e instanceof TypeError && e.message.toLowerCase().includes("fetch");
        if (attempt === 0 && isNetworkError) {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        setError(e.message);
        break;
      }
    }
    setStarting(false);
  }

  function handleReset() {
    setSession(null); setResult(null);
    setJdFile(null); setResumeFile(null);
    setError(null); setDifficulty("mid");
  }

  // ── Share panel after session created ────────────────────────────────────────
  if (session) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <Nav/>
        <SharePanel
          sessionId={session.sessionId}
          candidateName={session.candidateName}
          roleTitle={session.roleTitle}
          difficulty={difficulty}
          onReset={handleReset}
        />
      </div>
    );
  }

  // ── Setup form ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Nav/>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 8 }}>Set up the interview</h1>
          <p style={{ color: "var(--text-2)", fontSize: 15 }}>
            Upload the job description and candidate resume. The AI will parse both,
            show you the skills analysis, then generate a private candidate link.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div>
            <span className="label">Job description</span>
            <FileDropZone label="Drop JD here" accept=".pdf,.docx,.txt"
              file={jdFile} onFile={setJdFile} icon="📋"/>
          </div>
          <div>
            <span className="label">Candidate resume</span>
            <FileDropZone label="Drop resume here" accept=".pdf,.docx,.txt"
              file={resumeFile} onFile={setResumeFile} icon="👤"/>
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <span className="label">Interview difficulty</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {DIFFICULTIES.map((d) => (
              <button key={d.value} onClick={() => setDifficulty(d.value)} style={{
                background: difficulty === d.value ? "var(--accent-dim)" : "var(--bg3)",
                border: `1px solid ${difficulty === d.value ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "var(--radius)", padding: "12px 14px", textAlign: "left",
                cursor: "pointer", transition: "all 0.15s",
              }}>
                <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 3,
                             color: difficulty === d.value ? "var(--accent)" : "var(--text)" }}>
                  {d.label}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.4 }}>{d.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ background: "var(--danger-dim)", border: "1px solid var(--danger)",
                        borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 20,
                        fontSize: 14, color: "var(--danger)" }}>{error}</div>
        )}

        <button className="btn btn-primary" onClick={handleParse} disabled={!canParse}
          style={{ width: "100%", justifyContent: "center", padding: 14, fontSize: 15 }}>
          {loading
            ? <><div className="spinner" style={{ width: 18, height: 18 }}/>Parsing files with AI...</>
            : "Parse and analyse files →"}
        </button>

        {result && (
          <>
            {/* HR-only label */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28, marginBottom: 4 }}>
              <span className="badge badge-warning" style={{ fontSize: 11 }}>HR only — not visible to candidate</span>
            </div>
            <ParsePreview result={result}/>
            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={handleStartInterview} disabled={starting}
                style={{ padding: "13px 32px", fontSize: 15 }}>
                {starting
                  ? <><div className="spinner" style={{ width: 18, height: 18 }}/>Generating questions...</>
                  : "Generate candidate link →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
