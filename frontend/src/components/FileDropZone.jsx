import React, { useRef, useState } from "react";

export default function FileDropZone({ label, accept, file, onFile, icon }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  const handle = (f) => {
    if (!f) return;
    const allowed = ["application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain"];
    const ok = allowed.includes(f.type) || f.name.endsWith(".pdf") || f.name.endsWith(".docx") || f.name.endsWith(".txt");
    if (ok) onFile(f);
  };

  return (
    <div
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
      style={{
        border: `1.5px dashed ${dragging ? "var(--accent)" : file ? "var(--success)" : "var(--border-hover)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "28px 20px",
        textAlign: "center",
        cursor: "pointer",
        background: dragging ? "var(--accent-dim)" : file ? "var(--success-dim)" : "var(--bg3)",
        transition: "all 0.2s",
        userSelect: "none",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => handle(e.target.files[0])}
      />

      <div style={{ fontSize: 28, marginBottom: 8 }}>{file ? "✓" : icon}</div>

      {file ? (
        <>
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--success)", marginBottom: 4 }}>
            {file.name}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-3)" }}>
            {(file.size / 1024).toFixed(0)} KB · click to replace
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 4 }}>
            {label}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-3)" }}>
            PDF or DOCX · drag and drop or click to browse
          </p>
        </>
      )}
    </div>
  );
}
