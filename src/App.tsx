/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GrievanceProvider } from './context/GrievanceContext';
import { ToastProvider } from './context/ToastContext';
import { ComplaintDetailPage } from './pages/ComplaintDetailPage';
import { ComplaintsPage } from './pages/ComplaintsPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage } from './pages/SettingsPage';

const AppRoutes: React.FC = () => {
  const { status, enterDemoMode } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && status === 'unauthenticated') {
      enterDemoMode();
    }
  }, [status, enterDemoMode]);

  if (status !== 'authenticated' && status !== 'demo') {
    return <LoginPage />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/complaints" element={<ComplaintsPage />} />
        <Route path="/complaints/:id" element={<ComplaintDetailPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <GrievanceProvider>
              <AppRoutes />
            </GrievanceProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
