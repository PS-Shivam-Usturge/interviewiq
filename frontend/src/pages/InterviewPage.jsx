import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder.js";

const CATEGORY_LABELS = {
  opening:     { label: "Opening",     color: "var(--accent)" },
  technical:   { label: "Technical",   color: "#f59e0b" },
  behavioural: { label: "Behavioural", color: "#34c78a" },
  scenario:    { label: "Scenario",    color: "#e879f9" },
  closing:     { label: "Closing",     color: "var(--text-2)" },
  follow_up:   { label: "Follow-up",  color: "#f04747" },
};

// ── TTS — agent reads question aloud ─────────────────────────────────────────
function speakText(text, onDone) {
  if (!window.speechSynthesis) { onDone?.(); return; }
  window.speechSynthesis.cancel();
  const utt     = new SpeechSynthesisUtterance(text);
  utt.rate      = 0.92;
  utt.pitch     = 1;
  utt.volume    = 1;
  // Prefer a natural-sounding voice
  const voices  = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Daniel")
  );
  if (preferred) utt.voice = preferred;
  utt.onend = () => onDone?.();
  utt.onerror = () => onDone?.();
  window.speechSynthesis.speak(utt);
}

// ── Browser check ─────────────────────────────────────────────────────────────
function BrowserWarning() {
  const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
  const isEdge   = /Edg/.test(navigator.userAgent);
  if (isChrome || isEdge) return null;
  return (
    <div style={{ background: "var(--warning-dim)", border: "1px solid var(--warning)",
                  borderRadius: "var(--radius)", padding: "10px 16px", marginBottom: 16,
                  fontSize: 13, color: "var(--warning)" }}>
      ⚠ Voice recording works best in Chrome or Edge. Some features may not work in this browser.
    </div>
  );
}

// ── Mic visualiser ────────────────────────────────────────────────────────────
function MicVisualiser({ isListening, silenceCountdown }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                  padding: "28px 0" }}>
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        background: isListening ? "rgba(91,124,255,0.15)" : "var(--bg3)",
        border: `2px solid ${isListening ? "var(--accent)" : "var(--border)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: isListening ? "pulse 1.5s ease-in-out infinite" : "none",
        transition: "all 0.3s",
      }}>
        <span style={{ fontSize: 32 }}>{isListening ? "🎙" : "🎤"}</span>
      </div>

      {isListening && silenceCountdown !== null && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <p style={{ fontSize: 13, color: "var(--warning)" }}>
            Submitting in {silenceCountdown}s...
          </p>
          <p style={{ fontSize: 11, color: "var(--text-3)" }}>speak to continue</p>
        </div>
      )}

      {isListening && silenceCountdown === null && (
        <p style={{ fontSize: 13, color: "var(--accent)" }}>Listening... speak your answer</p>
      )}
    </div>
  );
}



// AnswerFeedback removed — scores are HR-only

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InterviewPage() {
  const { id }    = useParams();
  const { state } = useLocation();
  const navigate  = useNavigate();

  const [session, setSession]             = useState(state?.session || null);
  const [currentQuestion, setCurrentQ]   = useState(state?.session?.currentQuestion || null);
  const [submitting, setSubmitting]       = useState(false);
  const [error, setError]                 = useState(null);
  const [progress, setProgress]           = useState({ current: 1, total: state?.session?.totalQuestions || 0, percent: 0 });
  const [history, setHistory]             = useState([]);
  const [isComplete, setIsComplete]       = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  // Candidate must click Begin — prevents auto-start before mic permission
  const [hasStarted, setHasStarted]      = useState(false);
  const [loadingSession, setLoadingSession] = useState(!state?.session);

  // Ref always holds the latest currentQuestion — lets stale closures (e.g. the
  // first-render handleSubmit captured by useVoiceRecorder) read the current value.
  const currentQuestionRef = useRef(currentQuestion);
  currentQuestionRef.current = currentQuestion;

  // Voice recorder hook
  const voice = useVoiceRecorder({
    sessionId: id,
    onTranscript: (transcript) => {
      setLastTranscript(transcript);
      handleSubmit(transcript);
    },
  });

  // Load session if no state (candidate opened link directly)
  useEffect(() => {
    if (!session) {
      fetch(`/api/session/${id}`)
        .then(r => r.json())
        .then(data => {
          setSession(data);
          setCurrentQ(data.currentQuestion);
          setProgress(data.progress);
          setLoadingSession(false);
        })
        .catch(() => { setError("Could not load session"); setLoadingSession(false); });
    }
  }, [id]);

  // Speak question when it changes — only after candidate clicks Begin
  useEffect(() => {
    if (!currentQuestion?.question || !hasStarted) return;
    setAgentSpeaking(true);
    const t = setTimeout(() => {
      speakText(currentQuestion.question, () => setAgentSpeaking(false));
    }, 400);
    return () => clearTimeout(t);
  }, [currentQuestion?.id, hasStarted]);

  // Submit transcript to backend
  async function handleSubmit(transcript) {
    if (!transcript?.trim()) return;
    // Snapshot the current question via ref — guards against stale closures when
    // this function is called from a first-render version captured by useVoiceRecorder.
    const q = currentQuestionRef.current;
    setSubmitting(true);
    setError(null);
    voice.clearLiveTranscript();   // clear HR monitor while agent evaluates

    try {
      const res  = await fetch(`/api/session/${id}/answer`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setHistory(h => [...h, {
        question: q?.question || "",
        category: q?.category || "unknown",
        answer:   transcript,
      }]);

      if (data.isComplete) {
        setIsComplete(true);
        setCurrentQ(null);
        setSubmitting(false);
        setTimeout(() => navigate(`/thankyou`), 2000);
      } else {
        // Keep submitting=true (loading overlay stays visible) until the new
        // question is ready — prevents the old question re-appearing with a live mic.
        setTimeout(() => {
          setCurrentQ(data.nextQuestion);
          setProgress(data.progress);
          setSubmitting(false);
        }, 400);
      }
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  // Loading state while fetching session
  if (loadingSession) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex",
                    flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div className="spinner" style={{ width: 28, height: 28 }}/>
        <p style={{ color: "var(--text-2)", fontSize: 14 }}>Loading your interview session...</p>
      </div>
    );
  }

  // Candidate welcome screen — shown before interview begins
  if (!hasStarted && session) {
    const roleTitle = session.jd_summary?.role_title || session.roleTitle || "this role";
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex",
                    alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div className="card fade-in" style={{ maxWidth: 520, width: "100%", padding: "40px 36px",
                                               textAlign: "center" }}>
          <div style={{ width: 56, height: 56, background: "var(--accent-dim)", borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 26, margin: "0 auto 20px" }}>🎙</div>

          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
            Welcome to your interview
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, marginBottom: 6 }}>
            {roleTitle}
          </p>
          {session.candidateName && (
            <p style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 28 }}>
              Hello, {session.candidateName}
            </p>
          )}

          <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)",
                        padding: "16px 20px", marginBottom: 28, textAlign: "left" }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)",
                        marginBottom: 10 }}>BEFORE YOU BEGIN</p>
            {[
              "Use Chrome or Edge for best voice support",
              "Find a quiet place — the agent will speak questions aloud",
              "Allow microphone access when the browser prompts you",
              "Speak clearly — 4 seconds of silence auto-submits your answer",
              "Take your time — there is no strict time limit per question",
            ].map((tip, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                <span style={{ color: "var(--accent)", fontSize: 13, flexShrink: 0, marginTop: 1 }}>·</span>
                <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>{tip}</p>
              </div>
            ))}
          </div>

          {error && (
            <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 16 }}>{error}</p>
          )}

          <button className="btn btn-primary" onClick={() => setHasStarted(true)}
            style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: 15 }}>
            Begin interview →
          </button>

          <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 14 }}>
            {session.totalQuestions || "~8"} questions · powered by InterviewIQ
          </p>
        </div>
      </div>
    );
  }

  // Completion screen
  if (isComplete) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex",
                    alignItems: "center", justifyContent: "center" }}>
        <div className="card fade-in" style={{ maxWidth: 520, width: "100%",
                                               textAlign: "center", padding: "48px 36px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Interview complete!</h2>
          <p style={{ color: "var(--text-2)", marginBottom: 8 }}>
            {session?.candidateName || "Candidate"} answered {history.length} questions.
          </p>
          <p style={{ color: "var(--text-3)", fontSize: 13 }}>
            Thank you — redirecting you now...
          </p>
        </div>
      </div>
    );
  }

  const catInfo = CATEGORY_LABELS[currentQuestion?.category] || CATEGORY_LABELS.opening;

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
          {session?.candidateName && (
            <span style={{ color: "var(--text-3)", fontSize: 13 }}>— {session.candidateName}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* HR monitor link */}
          <a href={`/monitor/${id}`} target="_blank" rel="noreferrer"
             style={{ fontSize: 12, color: "var(--text-3)", textDecoration: "none",
                      padding: "4px 10px", border: "1px solid var(--border)",
                      borderRadius: 6 }}>
            HR monitor ↗
          </a>
          <span className="badge badge-accent">{session?.difficulty?.toUpperCase() || "MID"}</span>
          <span style={{ fontSize: 13, color: "var(--text-2)" }}>
            Q{progress.current} of {progress.total}
          </span>
        </div>
      </nav>

      {/* Progress bar */}
      <div style={{ height: 3, background: "var(--bg3)" }}>
        <div style={{ height: "100%", background: "var(--accent)",
                      width: `${progress.percent}%`, transition: "width 0.5s ease" }}/>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
        <BrowserWarning/>

        {/* Question card */}
        {currentQuestion && (
          <div className="card fade-in" style={{ marginBottom: 20, borderColor: catInfo.color + "44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span className="badge" style={{ background: catInfo.color + "22", color: catInfo.color }}>
                {catInfo.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                Question {progress.current} of {progress.total}
              </span>
              {agentSpeaking && (
                <span className="badge badge-accent" style={{ marginLeft: "auto", fontSize: 11,
                                                              animation: "pulse 1s infinite" }}>
                  🔊 Agent speaking...
                </span>
              )}
            </div>
            <p style={{ fontSize: 17, lineHeight: 1.75, color: "var(--text)", fontWeight: 400 }}>
              {currentQuestion.question}
            </p>
          </div>
        )}

        {/* Analysing overlay — shown while agent evaluates the answer (can take 20–40s) */}
        {currentQuestion && submitting && (
          <div className="card" style={{ marginTop: 20, textAlign: "center", padding: "40px 24px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <div className="spinner" style={{ width: 32, height: 32 }}/>
              <p style={{ fontSize: 15, color: "var(--text-2)", fontWeight: 500 }}>
                Evaluating your answer...
              </p>
              <p style={{ fontSize: 13, color: "var(--text-3)" }}>
                The AI is scoring your response. This usually takes 20–40 seconds.
              </p>
            </div>
          </div>
        )}

        {/* Voice interface — no feedback shown to candidate */}
        {currentQuestion && !submitting && (
          <div className="card" style={{ marginTop: 20, textAlign: "center" }}>

            {/* Status label */}
            <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4,
                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {agentSpeaking ? "Agent is reading the question..." :
               voice.isListening  ? "Recording your answer" :
               voice.isProcessing ? "Transcribing with Groq Whisper..." :
               "Ready to record"}
            </p>

            <MicVisualiser
              isListening={voice.isListening}
              silenceCountdown={voice.silenceCountdown}
            />

            {/* Transcript preview */}
            {lastTranscript && !voice.isListening && (
              <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)",
                            padding: "12px 16px", marginBottom: 16, textAlign: "left" }}>
                <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>YOUR ANSWER</p>
                <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{lastTranscript}</p>
              </div>
            )}

            {/* Error */}
            {voice.errorMsg && (
              <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>{voice.errorMsg}</p>
            )}
            {error && (
              <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>{error}</p>
            )}

            {/* Controls */}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {!voice.isListening && !voice.isProcessing && !agentSpeaking && (
                <button className="btn btn-primary" onClick={voice.startRecording}
                  style={{ padding: "12px 28px", fontSize: 14 }}>
                  🎙 Start speaking
                </button>
              )}
              {voice.isListening && (
                <button className="btn btn-ghost" onClick={voice.stopRecording}
                  style={{ padding: "12px 22px", fontSize: 14 }}>
                  ⏹ Done speaking
                </button>
              )}
              {voice.isProcessing && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-2)", fontSize: 13 }}>
                  <div className="spinner" style={{ width: 18, height: 18 }}/>
                  Transcribing...
                </div>
              )}
            </div>

            <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 14 }}>
              Silence for 4 seconds auto-submits · Works best in Chrome
            </p>
          </div>
        )}

        {/* Answered questions — candidate sees questions + their own answer only, no scores */}
        {history.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <p className="label">Answered ({history.length})</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.map((h, i) => (
                <div key={i} style={{
                  background: "var(--bg3)", borderRadius: "var(--radius)",
                  padding: "12px 16px", borderLeft: "2px solid var(--success)",
                }}>
                  <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 6, lineHeight: 1.5 }}>
                    {h.question}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
                    "{h.answer.slice(0, 140)}{h.answer.length > 140 ? "..." : ""}"
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
