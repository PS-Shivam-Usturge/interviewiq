import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import SetupPage     from "./pages/SetupPage.jsx";
import InterviewPage from "./pages/InterviewPage.jsx";
import ReportPage    from "./pages/ReportPage.jsx";
import MonitorPage   from "./pages/MonitorPage.jsx";
import ThankYouPage  from "./pages/ThankYouPage.jsx";
import TracePage     from "./pages/TracePage.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* HR routes */}
        <Route path="/"                   element={<SetupPage />} />
        <Route path="/report/:sessionId"  element={<ReportPage />} />
        <Route path="/monitor/:sessionId" element={<MonitorPage />} />

        {/* Agent trace */}
        <Route path="/trace/:sessionId"   element={<TracePage />} />

        {/* Candidate routes */}
        <Route path="/interview/:id"      element={<InterviewPage />} />
        <Route path="/thankyou"           element={<ThankYouPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
