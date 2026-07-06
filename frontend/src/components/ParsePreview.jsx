import React from "react";

function SkillList({ skills }) {
  if (!skills?.length) return <span style={{ color: "var(--text-3)", fontSize: 13 }}>None detected</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {skills.map((s) => (
        <span key={s} className="skill-chip">{s}</span>
      ))}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

export default function ParsePreview({ result }) {
  const { jd, resume } = result;
  const jdS = jd.summary;
  const rS = resume.summary;

  const matchedSkills = jdS.required_skills?.filter(
    (s) => rS.skills?.some((rs) => rs.toLowerCase().includes(s.toLowerCase()))
  ) || [];
  const missingSkills = jdS.required_skills?.filter(
    (s) => !rS.skills?.some((rs) => rs.toLowerCase().includes(s.toLowerCase()))
  ) || [];
  const matchPct = jdS.required_skills?.length
    ? Math.round((matchedSkills.length / jdS.required_skills.length) * 100)
    : 0;

  return (
    <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>

      {/* JD Card */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500 }}>Job description</h3>
          <span className="badge badge-accent">{jdS.seniority_level || "Not specified"}</span>
        </div>

        <Section label="Role">
          <p style={{ fontSize: 14, color: "var(--text)" }}>{jdS.role_title || "—"}</p>
        </Section>

        <Section label="Summary">
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{jdS.summary}</p>
        </Section>

        <Section label="Required skills">
          <SkillList skills={jdS.required_skills} />
        </Section>

        <Section label="Tech stack">
          <SkillList skills={jdS.tech_stack} />
        </Section>

        {jdS.years_experience_required && (
          <Section label="Experience required">
            <p style={{ fontSize: 13, color: "var(--text-2)" }}>{jdS.years_experience_required}</p>
          </Section>
        )}
      </div>

      {/* Resume Card */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500 }}>Candidate resume</h3>
          {rS.years_total_experience && (
            <span className="badge badge-success">{rS.years_total_experience} yrs exp</span>
          )}
        </div>

        <Section label="Candidate">
          <p style={{ fontSize: 14, fontWeight: 500 }}>{rS.candidate_name || "Unknown"}</p>
          <p style={{ fontSize: 13, color: "var(--text-2)" }}>{rS.current_title || ""}</p>
        </Section>

        <Section label="Summary">
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{rS.summary}</p>
        </Section>

        <Section label="Skills">
          <SkillList skills={rS.skills?.slice(0, 12)} />
        </Section>

        {rS.red_flags?.length > 0 && (
          <Section label="Flags">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {rS.red_flags.map((f, i) => (
                <p key={i} style={{ fontSize: 12, color: "var(--warning)", display: "flex", gap: 6 }}>
                  <span>⚠</span>{f}
                </p>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Match bar — full width */}
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500 }}>Skills match</h3>
          <span
            className={`badge ${matchPct >= 70 ? "badge-success" : matchPct >= 40 ? "badge-warning" : "badge-danger"}`}
          >
            {matchPct}% match
          </span>
        </div>

        <div style={{ background: "var(--bg3)", borderRadius: 4, height: 6, marginBottom: 16, overflow: "hidden" }}>
          <div
            style={{
              width: `${matchPct}%`,
              height: "100%",
              borderRadius: 4,
              background: matchPct >= 70 ? "var(--success)" : matchPct >= 40 ? "var(--warning)" : "var(--danger)",
              transition: "width 0.8s ease",
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <span className="label" style={{ color: "var(--success)" }}>Matched skills</span>
            <SkillList skills={matchedSkills} />
          </div>
          <div>
            <span className="label" style={{ color: "var(--danger)" }}>Missing skills</span>
            <SkillList skills={missingSkills} />
          </div>
        </div>
      </div>
    </div>
  );
}
