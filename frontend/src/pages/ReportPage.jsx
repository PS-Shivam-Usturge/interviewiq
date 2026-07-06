import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";

const RECOMMENDATION_CONFIG = {
  strong_hire: { label: "Strong hire",  color: "#34c78a", bg: "rgba(52,199,138,0.12)", icon: "✦" },
  hire:        { label: "Hire",         color: "#34c78a", bg: "rgba(52,199,138,0.08)", icon: "✓" },
  maybe:       { label: "Maybe",        color: "#f59e0b", bg: "rgba(245,158,11,0.12)", icon: "?" },
  no_hire:     { label: "No hire",      color: "#f04747", bg: "rgba(240,71,71,0.12)",  icon: "✗" },
};

function ScoreRing({ score, size = 80, label }) {
  const r        = (size / 2) - 8;
  const circ     = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  const color    = score >= 70 ? "#34c78a" : score >= 45 ? "#f59e0b" : "#f04747";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${progress} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}/>
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
          style={{ fill: color, fontSize: size > 70 ? 18 : 13, fontWeight: 600,
                   transform: "rotate(90deg)", transformOrigin: `${size/2}px ${size/2}px`, fontFamily: "Inter,sans-serif" }}>
          {score}
        </text>
      </svg>
      {label && <span style={{ fontSize: 11, color: "var(--text-2)", textAlign: "center", maxWidth: size }}>{label}</span>}
    </div>
  );
}

function StarRating({ rating }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize: 13, color: i <= rating ? "#f59e0b" : "var(--text-3)" }}>★</span>
      ))}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-3)", letterSpacing: "0.06em",
                  textTransform: "uppercase", marginBottom: 12 }}>{title}</p>
      {children}
    </div>
  );
}

export default function ReportPage() {
  const { sessionId } = useParams();
  const navigate      = useNavigate();
  const reportRef     = useRef();

  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res  = await fetch(`/api/report/${sessionId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load report");
        setReport(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  function handlePrint() {
    window.print();
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div className="spinner" style={{ width: 32, height: 32 }}/>
      <p style={{ color: "var(--text-2)", fontSize: 15 }}>Generating eligibility report...</p>
      <p style={{ color: "var(--text-3)", fontSize: 13 }}>Analysing {" "} all answers — this takes about 20 seconds</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ maxWidth: 440, textAlign: "center" }}>
        <p style={{ color: "var(--danger)", marginBottom: 16 }}>{error}</p>
        <button className="btn btn-ghost" onClick={() => navigate("/")}>Back to home</button>
      </div>
    </div>
  );

  if (!report) return null;

  const rec    = RECOMMENDATION_CONFIG[report.recommendation] || RECOMMENDATION_CONFIG.maybe;
  const scores = [
    { label: "Technical",       value: report.technical_score },
    { label: "Communication",   value: report.communication_score },
    { label: "Problem solving", value: report.problem_solving_score },
    { label: "Culture fit",     value: report.culture_fit_score },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Nav */}
      <nav style={{ borderBottom: "1px solid var(--border)", padding: "0 32px", height: 56,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "var(--bg2)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "var(--accent)", borderRadius: 7,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 700, color: "#fff" }}>I</div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>InterviewIQ</span>
          <span style={{ color: "var(--text-3)", fontSize: 13 }}>— Eligibility Report</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={handlePrint} style={{ fontSize: 13 }}>
            ⬇ Export PDF
          </button>
          <button className="btn btn-primary" onClick={() => navigate("/")} style={{ fontSize: 13 }}>
            New interview
          </button>
        </div>
      </nav>

      <div ref={reportRef} style={{ maxWidth: 860, margin: "0 auto", padding: "36px 24px" }}>

        {/* Header — candidate + verdict */}
        <div className="card fade-in" style={{ marginBottom: 20, padding: "28px 32px",
             borderColor: rec.color + "44", background: "var(--bg2)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase",
                               letterSpacing: "0.06em" }}>Candidate</span>
                {report.confidence && (
                  <span className="badge badge-accent" style={{ fontSize: 10 }}>
                    {report.confidence} confidence
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>
                {report.candidateName || "Candidate"}
              </h1>
              <p style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 12 }}>
                {report.roleTitle || "Role"}
              </p>
              {report.headline && (
                <p style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.6, fontStyle: "italic",
                             borderLeft: "2px solid var(--accent)", paddingLeft: 14 }}>
                  {report.headline}
                </p>
              )}
            </div>

            {/* Verdict badge */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                          background: rec.bg, border: `1px solid ${rec.color}44`,
                          borderRadius: 12, padding: "20px 28px", flexShrink: 0 }}>
              <span style={{ fontSize: 28, color: rec.color }}>{rec.icon}</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: rec.color }}>{rec.label}</span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>Verdict</span>
            </div>
          </div>
        </div>

        {/* Score cards */}
        <div className="card fade-in" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around",
                        flexWrap: "wrap", gap: 24, padding: "8px 0" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <ScoreRing score={report.overall_score} size={90}/>
              <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>Overall score</span>
            </div>
            <div style={{ width: 1, height: 80, background: "var(--border)", flexShrink: 0 }}/>
            {scores.map((s) => (
              <ScoreRing key={s.label} score={s.value} size={66} label={s.label}/>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

          {/* Strengths */}
          <div className="card">
            <Section title="Strengths">
              {(report.strengths || []).length === 0
                ? <p style={{ color: "var(--text-3)", fontSize: 13 }}>None noted</p>
                : (report.strengths || []).map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                      <span style={{ color: "#34c78a", fontSize: 14, flexShrink: 0, marginTop: 1 }}>✓</span>
                      <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{s}</p>
                    </div>
                  ))}
            </Section>
          </div>

          {/* Gaps */}
          <div className="card">
            <Section title="Gaps & areas to probe">
              {(report.gaps || []).length === 0
                ? <p style={{ color: "var(--text-3)", fontSize: 13 }}>No significant gaps noted</p>
                : (report.gaps || []).map((g, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                      <span style={{ color: "#f59e0b", fontSize: 14, flexShrink: 0, marginTop: 1 }}>△</span>
                      <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{g}</p>
                    </div>
                  ))}
            </Section>

            {(report.red_flags || []).length > 0 && (
              <Section title="Red flags">
                {report.red_flags.map((f, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ color: "#f04747", fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚑</span>
                    <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{f}</p>
                  </div>
                ))}
              </Section>
            )}
          </div>
        </div>

        {/* Skill ratings */}
        {(report.skill_ratings || []).length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <Section title="Skill ratings">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {report.skill_ratings.map((s, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "180px auto 1fr",
                                        gap: 16, alignItems: "center",
                                        paddingBottom: 10, borderBottom: i < report.skill_ratings.length - 1
                                          ? "1px solid var(--border)" : "none" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", fontFamily: "var(--mono)" }}>
                      {s.skill}
                    </span>
                    <StarRating rating={s.rating}/>
                    <span style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
                      {s.evidence}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* Narrative */}
        {report.narrative && (
          <div className="card" style={{ marginBottom: 16 }}>
            <Section title="Detailed evaluation">
              {report.narrative.split("\n").filter(Boolean).map((para, i) => (
                <p key={i} style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.8,
                                    marginBottom: 14 }}>{para}</p>
              ))}
            </Section>
          </div>
        )}

        {/* Next steps */}
        {(report.suggested_next_steps || []).length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <Section title="Suggested next steps">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {report.suggested_next_steps.map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "center",
                                        background: "var(--bg3)", borderRadius: 8, padding: "10px 14px" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent-dim)",
                                   color: "var(--accent)", fontSize: 12, fontWeight: 600, display: "flex",
                                   alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--text-2)" }}>{step}</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "16px 0 32px" }}>
          <p style={{ fontSize: 12, color: "var(--text-3)" }}>
            Generated by InterviewIQ · Session {sessionId?.slice(0, 8)}...
          </p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          nav { display: none !important; }
          body { background: white !important; color: black !important; }
          .card { border: 1px solid #ddd !important; background: white !important; }
          * { color: black !important; }
        }
      `}</style>
    </div>
  );
}
