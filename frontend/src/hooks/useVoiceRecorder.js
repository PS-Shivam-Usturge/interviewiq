import { useState, useRef, useCallback } from "react";

const SILENCE_THRESHOLD  = 0.01;  // RMS below this = silence
const SILENCE_TIMEOUT_MS = 4000;  // auto-submit after 4s of silence
const MIN_RECORD_MS      = 1500;  // don't auto-submit if < 1.5s recorded

export function useVoiceRecorder({ onTranscript, onLiveTranscript, sessionId }) {
  // Keep a ref to the latest onTranscript so the memoized startRecording closure
  // (captured on first render) always calls the current version of the callback.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const [state, setState] = useState("idle"); // idle | listening | processing | error
  const [liveText, setLiveText]       = useState("");
  const [errorMsg, setErrorMsg]       = useState("");
  const [silenceCountdown, setSilenceCountdown] = useState(null);

  const mediaRecorderRef  = useRef(null);
  const audioChunksRef    = useRef([]);
  const streamRef         = useRef(null);
  const analyserRef       = useRef(null);
  const silenceTimerRef   = useRef(null);
  const countdownTimerRef = useRef(null);
  const recordStartRef    = useRef(null);
  const animFrameRef      = useRef(null);

  // ── Silence detection loop ────────────────────────────────────────────────

  function startSilenceDetection() {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.fftSize);
    let silenceStart = null;

    function tick() {
      if (!analyserRef.current) return;
      analyser.getByteTimeDomainData(data);

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const isSilent = rms < SILENCE_THRESHOLD;

      const elapsed = Date.now() - (recordStartRef.current || Date.now());

      if (isSilent && elapsed > MIN_RECORD_MS) {
        if (!silenceStart) silenceStart = Date.now();
        const silenceDuration = Date.now() - silenceStart;
        const remaining = Math.max(0, SILENCE_TIMEOUT_MS - silenceDuration);
        setSilenceCountdown(Math.ceil(remaining / 1000));

        if (silenceDuration >= SILENCE_TIMEOUT_MS) {
          stopRecording();
          return;
        }
      } else {
        silenceStart = null;
        setSilenceCountdown(null);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Start recording ───────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setErrorMsg("");
    setLiveText("");
    setSilenceCountdown(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // Audio analyser for silence detection
      const ctx      = new AudioContext();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      // MediaRecorder — prefer webm/opus, fallback to whatever browser supports
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        await handleRecordingComplete();
      };

      recorder.start(200); // collect chunks every 200ms
      recordStartRef.current = Date.now();
      setState("listening");
      startSilenceDetection();

    } catch (err) {
      const msg = err.name === "NotAllowedError"
        ? "Microphone permission denied. Please allow mic access and try again."
        : "Could not access microphone: " + err.message;
      setErrorMsg(msg);
      setState("error");
    }
  }, [sessionId]);

  // ── Stop recording ────────────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    setSilenceCountdown(null);

    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setState("processing");
  }, []);

  // ── Send to Groq Whisper ──────────────────────────────────────────────────

  async function handleRecordingComplete() {
    const chunks = audioChunksRef.current;
    if (!chunks.length) {
      setState("idle");
      return;
    }

    const blob = new Blob(chunks, { type: "audio/webm" });

    // Min size check — very short recordings are usually noise
    if (blob.size < 2000) {
      setErrorMsg("Recording too short — please speak your answer.");
      setState("error");
      setTimeout(() => setState("idle"), 2000);
      return;
    }

    setState("processing");

    try {
      const form = new FormData();
      form.append("audio", blob, "answer.webm");

      const res  = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Transcription failed");
      if (!data.transcript?.trim()) throw new Error("No speech detected — please try again");

      setLiveText(data.transcript);
      pushLiveTranscript(data.transcript);
      onTranscriptRef.current(data.transcript);
      setState("idle");

    } catch (err) {
      setErrorMsg(err.message);
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  // ── Push live text to monitor ─────────────────────────────────────────────

  function pushLiveTranscript(text) {
    if (!sessionId || !text) return;
    fetch(`/api/monitor/${sessionId}/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: text }),
    }).catch(() => {}); // fire and forget
  }

  return {
    state,           // idle | listening | processing | error
    liveText,        // transcript shown as candidate speaks (post-Whisper)
    errorMsg,
    silenceCountdown, // seconds until auto-submit (null if speaking)
    startRecording,
    stopRecording,
    clearLiveTranscript: () => pushLiveTranscript(""),
    isListening:  state === "listening",
    isProcessing: state === "processing",
  };
}
