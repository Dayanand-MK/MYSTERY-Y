import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { SpeedInsights } from '@vercel/speed-insights/react';

// Participant Pages
import Landing from './pages/participant/Landing';
import Rules from './pages/participant/Rules';
import Register from './pages/participant/Register';
import VerifyCase from './pages/participant/VerifyCase';
import Investigation from './pages/participant/Investigation';
import Review from './pages/participant/Review';
import Submitted from './pages/participant/Submitted';

// Admin Pages
import AdminLogin from './pages/admin/Login';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminTeams from './pages/admin/Teams';
import AdminCases from './pages/admin/Cases';
import QuestionBuilder from './pages/admin/QuestionBuilder';
import AdminSubmissions from './pages/admin/Submissions';
import AdminScoring from './pages/admin/Scoring';
import AdminSecurity from './pages/admin/Security';
import AdminLeaderboard from './pages/admin/Leaderboard';
import AdminSettings from './pages/admin/Settings';
import AdminTestMode from './pages/admin/TestMode';
import AdminManagement from './pages/admin/AdminManagement';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ========================================== */}
          {/* PARTICIPANT GATEWAY ROUTES                 */}
          {/* ========================================== */}
          <Route path="/" element={<Landing />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-case" element={<VerifyCase />} />
          <Route path="/investigation" element={<Investigation />} />
          <Route path="/review" element={<Review />} />
          <Route path="/submitted" element={<Submitted />} />

          {/* ========================================== */}
          {/* ADMIN COMMAND CENTRE ROUTES                */}
          {/* ========================================== */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="teams" element={<AdminTeams />} />
            <Route path="cases" element={<AdminCases />} />
            <Route path="questions" element={<QuestionBuilder />} />
            <Route path="submissions" element={<AdminSubmissions />} />
            <Route path="scoring" element={<AdminScoring />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="leaderboard" element={<AdminLeaderboard />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="test-mode" element={<AdminTestMode />} />
            <Route path="admin-management" element={<AdminManagement />} />
          </Route>

          {/* Redirect fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <SpeedInsights />
      </AuthProvider>
    </BrowserRouter>
  );
}
