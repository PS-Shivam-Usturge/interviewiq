import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ── Event rendering helpers ───────────────────────────────────────────────────

const PHASE_COLOR = {
  setup:     "var(--accent)",
  interview: "var(--text-2)",
  report:    "var(--success)",
};

const VERDICT_COLOR = {
  strong:     "var(--success)",
  adequate:   "var(--accent)",
  weak:       "var(--warning)",
  concerning: "var(--danger)",
};

const ACTION_COLOR = {
  advance:        "var(--success)",
  followup:       "var(--warning)",
  conclude_early: "var(--accent)",
};

const RECOMMEND_COLOR = {
  strong_hire: "var(--success)",
  hire:        "var(--success)",
  maybe:       "var(--warning)",
  no_hire:     "var(--danger)",
};

const SEVERITY_COLOR = {
  info:     "var(--accent)",
  warning:  "var(--warning)",
  critical: "var(--danger)",
};

const TOOL_ICON = {
  parse_documents:       "📄",
  generate_question_bank: "🗂",
  evaluate_answer:       "🔍",
  advance_to_next_question: "➡",
  request_followup:      "↩",
  conclude_interview_early: "🏁",
  note_cumulative_concern:  "📋",
  generate_final_report:    "📝",
};

function fmt(unixSec) {
  if (!unixSec) return "";
  return new Date(unixSec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Tag({ label, color }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 6,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      background: color ? color + "22" : "var(--bg3)",
      color: color || "var(--text-2)", border: `1px solid ${color || "var(--border)"}44`,
    }}>
      {label}
    </span>
  );
}

function ScoreBars({ scores }) {
  const bars = [
    { label: "Technical",     value: scores?.technical },
    { label: "Communication", value: scores?.communication },
    { label: "Depth",         value: scores?.depth },
    { label: "Overall",       value: scores?.overall },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
      {bars.map(({ label, value }) => {
        const pct = ((value || 0) / 10) * 100;
        const color = value >= 7 ? "var(--success)" : value >= 5 ? "var(--warning)" : "var(--danger)";
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 100, fontSize: 11, color: "var(--text-2)", flexShrink: 0 }}>{label}</span>
            <div style={{ flex: 1, height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s ease" }} />
            </div>
            <span style={{ width: 24, fontSize: 12, fontWeight: 700, color, textAlign: "right" }}>{value ?? "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

function EventCard({ ev, index }) {
  const [open, setOpen] = useState(index < 4);

  if (ev.event === "session_started") {
    return (
      <div style={cardStyle("var(--accent)")}>
        <div style={cardHeader}>
          <span style={{ fontSize: 18 }}>🚀</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Session started</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
              {ev.candidate} · {ev.role} · {ev.difficulty} · {ev.totalQuestions} questions
            </div>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{fmt(ev.time)}</span>
        </div>
      </div>
    );
  }

  if (ev.event === "tool_call") {
    return (
      <div style={cardStyle("var(--accent)")}>
        <button style={expandBtn} onClick={() => setOpen(o => !o)}>
          <div style={cardHeader}>
            <span style={{ fontSize: 16 }}>{TOOL_ICON[ev.tool] || "🔧"}</span>
            <div style={{ flex: 1 }}>
              <code style={{ fontSize: 13, color: "var(--accent)" }}>{ev.tool}</code>
              <Tag label="setup" color="var(--accent)" />
            </div>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{fmt(ev.time)}</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
          </div>
        </button>
        {open && (
          <div style={expandBody}>
            {ev.reasoning && <p style={reasoningStyle}>{ev.reasoning}</p>}
            {ev.focusAreas?.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {ev.focusAreas.map(f => <Tag key={f} label={f} color="var(--accent)" />)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (ev.event === "evaluation") {
    const overall = ev.scores?.overall ?? 0;
    const scoreColor = overall >= 7 ? "var(--success)" : overall >= 5 ? "var(--warning)" : "var(--danger)";
    return (
      <div style={cardStyle(scoreColor)}>
        <button style={expandBtn} onClick={() => setOpen(o => !o)}>
          <div style={cardHeader}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>Q{ev.questionIndex + 1} evaluated</span>
              {" "}<Tag label={ev.category} color="var(--text-3)" />
              {(ev.flags || []).map(f => <Tag key={f} label={f} color="var(--warning)" />)}
            </div>
            <span style={{ fontWeight: 700, color: scoreColor, fontSize: 15 }}>{overall}/10</span>
            <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 8 }}>{fmt(ev.time)}</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
          </div>
        </button>
        {open && (
          <div style={expandBody}>
            <p style={{ fontSize: 12, color: "var(--text-2)", fontStyle: "italic", marginBottom: 4 }}>"{ev.question}"</p>
            <ScoreBars scores={ev.scores} />
            {ev.analysis && <p style={{ ...reasoningStyle, marginTop: 10 }}>{ev.analysis}</p>}
          </div>
        )}
      </div>
    );
  }

  if (ev.event === "decision") {
    const color = ACTION_COLOR[ev.action] || "var(--text-2)";
    const label = ev.action === "advance" ? `Advance · ${ev.verdict}`
                : ev.action === "followup" ? "Follow-up"
                : `Conclude early · ${ev.preliminaryVerdict}`;
    return (
      <div style={cardStyle(color)}>
        <button style={expandBtn} onClick={() => setOpen(o => !o)}>
          <div style={cardHeader}>
            <span style={{ fontSize: 16 }}>
              {ev.action === "advance" ? "➡" : ev.action === "followup" ? "↩" : "🏁"}
            </span>
            <div style={{ flex: 1 }}>
              <Tag label={label} color={color} />
              {ev.verdict && <Tag label={ev.verdict} color={VERDICT_COLOR[ev.verdict]} />}
            </div>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{fmt(ev.time)}</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
          </div>
        </button>
        {open && (
          <div style={expandBody}>
            {ev.reasoning && <p style={reasoningStyle}>{ev.reasoning}</p>}
            {ev.followUpQuestion && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, borderLeft: "3px solid var(--warning)" }}>
                <span style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600 }}>Follow-up question: </span>
                <span style={{ fontSize: 13 }}>{ev.followUpQuestion}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (ev.event === "observation") {
    const color = SEVERITY_COLOR[ev.severity] || "var(--text-2)";
    return (
      <div style={cardStyle(color)}>
        <div style={cardHeader}>
          <span style={{ fontSize: 16 }}>📋</span>
          <div style={{ flex: 1 }}>
            <Tag label={`${ev.severity} concern`} color={color} />
            <span style={{ fontSize: 13, marginLeft: 8 }}>{ev.observation}</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{fmt(ev.time)}</span>
        </div>
      </div>
    );
  }

  if (ev.event === "session_complete") {
    return (
      <div style={cardStyle("var(--success)")}>
        <div style={cardHeader}>
          <span style={{ fontSize: 16 }}>✅</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600 }}>Interview complete</span>
            <span style={{ fontSize: 12, color: "var(--text-2)", marginLeft: 8 }}>
              {ev.answeredCount} questions answered{ev.concludedEarly ? " · concluded early" : ""}
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{fmt(ev.time)}</span>
        </div>
      </div>
    );
  }

  if (ev.event === "report_generated") {
    const color = RECOMMEND_COLOR[ev.recommendation] || "var(--text-2)";
    return (
      <div style={cardStyle(color)}>
        <div style={cardHeader}>
          <span style={{ fontSize: 16 }}>📝</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600 }}>Report generated</span>
            {" "}<Tag label={ev.recommendation?.replace("_", " ")} color={color} />
            <span style={{ fontSize: 12, color: "var(--text-2)", marginLeft: 8 }}>
              Score: {ev.overallScore}/100 · {ev.confidence} confidence
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{fmt(ev.time)}</span>
        </div>
        {ev.headline && (
          <p style={{ fontSize: 13, color: "var(--text-2)", fontStyle: "italic", marginTop: 8, paddingLeft: 28 }}>
            "{ev.headline}"
          </p>
        )}
      </div>
    );
  }

  // Fallback for unknown event types
  return (
    <div style={cardStyle()}>
      <div style={cardHeader}>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{ev.event}</span>
        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>{fmt(ev.time)}</span>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const cardStyle = (accentColor) => ({
  background: "var(--bg2)",
  border: `1px solid ${accentColor ? accentColor + "33" : "var(--border)"}`,
  borderLeft: `3px solid ${accentColor || "var(--border)"}`,
  borderRadius: "var(--radius)",
  padding: "12px 16px",
  position: "relative",
});

const cardHeader = {
  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
};

const expandBtn = {
  background: "none", border: "none", padding: 0, width: "100%",
  textAlign: "left", cursor: "pointer", color: "inherit",
};

const expandBody = {
  marginTop: 12, paddingTop: 12,
  borderTop: "1px solid var(--border)",
};

const reasoningStyle = {
  fontSize: 13, color: "var(--text-2)", lineHeight: 1.6,
  fontStyle: "italic",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TracePage() {
  const { sessionId } = useParams();
  const [data, setData]     = useState(null);
  const [error, setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/session/${sessionId}/trace`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [sessionId]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh", color: "var(--text-2)" }}>
      Loading trace…
    </div>
  );

  if (error || data?.error) return (
    <div style={{ maxWidth: 600, margin: "80px auto", padding: 24, textAlign: "center" }}>
      <p style={{ color: "var(--danger)" }}>{error || data?.error}</p>
    </div>
  );

  const setupEvents    = (data.events || []).filter(e => e.phase === "setup");
  const interviewEvents = (data.events || []).filter(e => e.phase === "interview");
  const reportEvents   = (data.events || []).filter(e => e.phase === "report");

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "32px 20px 80px" }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Agent Trace</h1>
          <span style={{
            padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: data.status === "completed" ? "var(--success-dim)" : "var(--warning-dim)",
            color: data.status === "completed" ? "var(--success)" : "var(--warning)",
          }}>{data.status}</span>
        </div>
        <p style={{ color: "var(--text-2)", fontSize: 14 }}>
          {data.candidateName} · {data.role || "Unknown role"} · {data.difficulty}
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
          <Link to={`/report/${sessionId}`} style={{ fontSize: 13 }}>View Report →</Link>
          <Link to={`/monitor/${sessionId}`} style={{ fontSize: 13 }}>Monitor →</Link>
        </div>
      </div>

      {/* Setup phase */}
      {setupEvents.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionHeading("var(--accent)")}>Setup phase</h2>
          <div style={timeline}>
            {setupEvents.map((ev, i) => <EventCard key={i} ev={ev} index={i} />)}
          </div>
        </section>
      )}

      {/* Interview phase */}
      {interviewEvents.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionHeading("var(--text-2)")}>Interview phase</h2>
          <div style={timeline}>
            {interviewEvents.map((ev, i) => <EventCard key={i} ev={ev} index={i} />)}
          </div>
        </section>
      )}

      {/* Report phase */}
      {reportEvents.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionHeading("var(--success)")}>Report phase</h2>
          <div style={timeline}>
            {reportEvents.map((ev, i) => <EventCard key={i} ev={ev} index={i} />)}
          </div>
        </section>
      )}

      {(data.events || []).length === 0 && (
        <div style={{ textAlign: "center", color: "var(--text-3)", padding: "60px 0" }}>
          No trace events yet — start an interview to see the agent's decisions here.
        </div>
      )}
    </div>
  );
}

const sectionHeading = (color) => ({
  fontSize: 12, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.08em", color, marginBottom: 12,
  paddingBottom: 6, borderBottom: `1px solid ${color}33`,
});

const timeline = {
  display: "flex", flexDirection: "column", gap: 8,
};
