import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";

const CATEGORY_LABELS = {
  opening:     { label: "Opening",     color: "var(--accent)" },
  technical:   { label: "Technical",   color: "#f59e0b" },
  behavioural: { label: "Behavioural", color: "#34c78a" },
  scenario:    { label: "Scenario",    color: "#e879f9" },
  closing:     { label: "Closing",     color: "var(--text-2)" },
  follow_up:   { label: "Follow-up",  color: "#f04747" },
};

function ScorePill({ label, score }) {
  const color = score >= 7 ? "var(--success)" : score >= 4 ? "var(--warning)" : "var(--danger)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                  background: color + "14", borderRadius: 8, padding: "6px 12px", minWidth: 64 }}>
      <span style={{ fontSize: 16, fontWeight: 700, color }}>{score}</span>
      <span style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }}>{label}</span>
    </div>
  );
}

export default function MonitorPage() {
  const { sessionId } = useParams();
  const [data, setData]         = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError]       = useState(null);
  const esRef                   = useRef(null);
  const transcriptRef           = useRef(null);

  useEffect(() => {
    const es = new EventSource(`/api/monitor/${sessionId}`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.error) { setError(parsed.error); return; }
        setData(parsed);
      } catch (_) {}
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects — don't close
    };

    return () => { es.close(); };
  }, [sessionId]);

  // Auto-scroll live transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [data?.liveTranscript]);

  if (error) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex",
                  alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ maxWidth: 400, textAlign: "center" }}>
        <p style={{ color: "var(--danger)", marginBottom: 8 }}>{error}</p>
        <p style={{ color: "var(--text-3)", fontSize: 13 }}>Check the session ID and try again.</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Nav */}
      <nav style={{ borderBottom: "1px solid var(--border)", padding: "0 32px", height: 56,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "var(--bg2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "var(--accent)", borderRadius: 7,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 700, color: "#fff" }}>I</div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>InterviewIQ</span>
          <span style={{ color: "var(--text-3)", fontSize: 13 }}>— HR Monitor</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%",
                        background: connected ? "var(--success)" : "var(--danger)",
                        animation: connected ? "pulse 1.5s infinite" : "none" }}/>
          <span style={{ fontSize: 12, color: connected ? "var(--success)" : "var(--danger)" }}>
            {connected ? "Live" : "Reconnecting..."}
          </span>
          {data && (
            <span className="badge badge-accent">{data.difficulty?.toUpperCase()}</span>
          )}
        </div>
      </nav>

      {/* Progress bar */}
      {data && (
        <div style={{ height: 3, background: "var(--bg3)" }}>
          <div style={{ height: "100%", background: "var(--accent)",
                        width: `${data.progress?.percent || 0}%`, transition: "width 0.5s ease" }}/>
        </div>
      )}

      {!data ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                      justifyContent: "center", minHeight: "80vh", gap: 16 }}>
          <div className="spinner" style={{ width: 28, height: 28 }}/>
          <p style={{ color: "var(--text-2)", fontSize: 14 }}>Connecting to interview session...</p>
        </div>
      ) : (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px",
                      display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>

          {/* Left — live feed */}
          <div>
            {/* Candidate + progress */}
            <div className="card" style={{ marginBottom: 16, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 600 }}>{data.candidateName || "Candidate"}</p>
                  <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                    Q{data.progress?.current} of {data.progress?.total} ·{" "}
                    {data.status === "completed" ? "Interview complete" : "In progress"}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>
                    {data.progress?.percent || 0}%
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-3)" }}>complete</p>
                </div>
              </div>
            </div>

            {/* Current question */}
            {data.currentQuestion && data.status !== "completed" && (
              <div className="card fade-in" style={{ marginBottom: 16,
                   borderColor: (CATEGORY_LABELS[data.currentCategory]?.color || "var(--accent)") + "44" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span className="badge" style={{
                    background: (CATEGORY_LABELS[data.currentCategory]?.color || "var(--accent)") + "22",
                    color: CATEGORY_LABELS[data.currentCategory]?.color || "var(--accent)"
                  }}>
                    {CATEGORY_LABELS[data.currentCategory]?.label || "Question"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>Current question</span>
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--text)" }}>
                  {data.currentQuestion}
                </p>
              </div>
            )}

            {data.status === "completed" && (
              <div className="card" style={{ marginBottom: 16, textAlign: "center",
                                             borderColor: "var(--success)44" }}>
                <p style={{ fontSize: 18, color: "var(--success)", fontWeight: 600 }}>
                  ✓ Interview completed
                </p>
                <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 6 }}>
                  Report is being generated
                </p>
              </div>
            )}

            {/* Live transcript */}
            {data.status !== "completed" && (
              <div className="card" style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.06em",
                             textTransform: "uppercase", marginBottom: 10 }}>
                  Live transcript
                  <span style={{ marginLeft: 8, width: 6, height: 6, borderRadius: "50%",
                                  background: "var(--danger)", display: "inline-block",
                                  animation: "pulse 1s infinite" }}/>
                </p>
                <div ref={transcriptRef} style={{ minHeight: 80, maxHeight: 160, overflowY: "auto",
                                                   background: "var(--bg3)", borderRadius: "var(--radius)",
                                                   padding: "12px 14px" }}>
                  {data.liveTranscript ? (
                    <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.7 }}>
                      {data.liveTranscript}
                      <span style={{ display: "inline-block", width: 2, height: 16,
                                      background: "var(--accent)", marginLeft: 3,
                                      animation: "pulse 0.8s infinite", verticalAlign: "middle" }}/>
                    </p>
                  ) : (
                    <p style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>
                      Waiting for candidate to speak...
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Answered questions */}
            {data.answers?.length > 0 && (
              <div>
                <p style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.06em",
                             textTransform: "uppercase", marginBottom: 10 }}>
                  Answered questions ({data.answers.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.answers.map((a, i) => (
                    <div key={i} className="card" style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 11,
                                        color: CATEGORY_LABELS[a.category]?.color || "var(--text-2)" }}>
                          {CATEGORY_LABELS[a.category]?.label || a.category}
                        </span>
                        <span style={{ flex: 1, fontSize: 13, color: "var(--text-2)" }}>{a.question}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginBottom: a.analysis ? 10 : 0 }}>
                        <ScorePill label="Tech"  score={a.scores.technical}/>
                        <ScorePill label="Comms" score={a.scores.communication}/>
                        <ScorePill label="Depth" score={a.scores.depth}/>
                      </div>
                      {a.analysis && (
                        <p style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic",
                                     marginTop: 8, lineHeight: 1.5 }}>{a.analysis}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right — running score summary */}
          <div>
            <div className="card" style={{ position: "sticky", top: 20 }}>
              <p style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.06em",
                           textTransform: "uppercase", marginBottom: 16 }}>
                Running scores
              </p>

              {data.answers?.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>
                  No answers yet
                </p>
              ) : (() => {
                const ans = data.answers;
                const avg = (key) => ans.length
                  ? Math.round(ans.reduce((s, a) => s + (a.scores[key] || 0), 0) / ans.length)
                  : 0;

                const dims = [
                  { label: "Technical",     key: "technical" },
                  { label: "Communication", key: "communication" },
                  { label: "Depth",         key: "depth" },
                ];

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {dims.map(({ label, key }) => {
                      const val   = avg(key);
                      const color = val >= 7 ? "var(--success)" : val >= 4 ? "var(--warning)" : "var(--danger)";
                      return (
                        <div key={key}>
                          <div style={{ display: "flex", justifyContent: "space-between",
                                         alignItems: "center", marginBottom: 5 }}>
                            <span style={{ fontSize: 13, color: "var(--text-2)" }}>{label}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color }}>{val}/10</span>
                          </div>
                          <div style={{ height: 5, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", background: color, borderRadius: 3,
                                          width: `${val * 10}%`, transition: "width 0.6s ease" }}/>
                          </div>
                        </div>
                      );
                    })}

                    <div style={{ marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                      <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>FLAGS DETECTED</p>
                      {(() => {
                        const allFlags = ans.flatMap(a => {
                          try { return Array.isArray(a.flags) ? a.flags : JSON.parse(a.flags || "[]"); }
                          catch { return []; }
                        });
                        const flagCounts = allFlags.reduce((acc, f) => {
                          acc[f] = (acc[f] || 0) + 1; return acc;
                        }, {});
                        const entries = Object.entries(flagCounts);
                        return entries.length === 0
                          ? <p style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>None so far</p>
                          : entries.map(([f, c]) => (
                              <div key={f} style={{ display: "flex", justifyContent: "space-between",
                                                     marginBottom: 5 }}>
                                <span className="badge badge-warning" style={{ fontSize: 11 }}>
                                  {f.replace(/_/g, " ")}
                                </span>
                                <span style={{ fontSize: 12, color: "var(--text-3)" }}>×{c}</span>
                              </div>
                            ));
                      })()}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
