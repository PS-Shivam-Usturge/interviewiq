import React from "react";

export default function ThankYouPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <div className="card fade-in" style={{
        maxWidth: 480,
        width: "100%",
        padding: "52px 40px",
        textAlign: "center",
      }}>
        {/* Icon */}
        <div style={{
          width: 64, height: 64,
          background: "var(--success-dim)",
          border: "1px solid var(--success)",
          borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, margin: "0 auto 24px",
        }}>✓</div>

        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
          Interview complete
        </h1>

        <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.7, marginBottom: 8 }}>
          Thank you for completing the interview. Your responses have been recorded.
        </p>

        <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6, marginBottom: 36 }}>
          The hiring team will review your answers and be in touch with next steps.
          You can close this tab.
        </p>

        <div style={{
          background: "var(--bg3)",
          borderRadius: "var(--radius)",
          padding: "14px 18px",
          fontSize: 13,
          color: "var(--text-3)",
          lineHeight: 1.6,
        }}>
          Powered by InterviewIQ · AI Interview Agent
        </div>
      </div>
    </div>
  );
}
