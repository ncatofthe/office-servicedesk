import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProductSettingsProvider } from './contexts/ProductSettingsContext';
import { Layout } from './components/Layout';
import { canAccessModule } from './access';

const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const TasksPage = lazy(() => import('./pages/TasksPage').then((m) => ({ default: m.TasksPage })));
const TeamPage = lazy(() => import('./pages/TeamPage').then((m) => ({ default: m.TeamPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const KanbanPage = lazy(() => import('./pages/KanbanPage').then((m) => ({ default: m.KanbanPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const ServiceDeskAdminPage = lazy(() => import('./pages/ServiceDeskAdminPage').then((m) => ({ default: m.ServiceDeskAdminPage })));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage').then((m) => ({ default: m.KnowledgePage })));
const CannedRepliesPage = lazy(() => import('./pages/CannedRepliesPage').then((m) => ({ default: m.CannedRepliesPage })));

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#2f2f2f] border-t-transparent" />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

const ModuleRouteGuard: React.FC<{ moduleKey: 'team' | 'admin' | 'knowledge' | 'reports' | 'cannedReplies'; children: React.ReactNode }> = ({
  moduleKey,
  children,
}) => {
  const { user } = useAuth();

  if (!user || !canAccessModule(user.role, moduleKey)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Suspense
      fallback={(
        <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#2f2f2f] border-t-transparent" />
        </div>
      )}
    >
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />}
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                <DashboardPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <Layout>
                <TasksPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickets"
          element={
            <ProtectedRoute>
              <Layout>
                <TasksPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/kanban"
          element={
            <ProtectedRoute>
              <Layout>
                <KanbanPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/queue"
          element={
            <ProtectedRoute>
              <Layout>
                <KanbanPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <ProfilePage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={(
            <ProtectedRoute>
              <ModuleRouteGuard moduleKey="admin">
                <Layout>
                  <ServiceDeskAdminPage />
                </Layout>
              </ModuleRouteGuard>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/knowledge"
          element={(
            <ProtectedRoute>
              <ModuleRouteGuard moduleKey="knowledge">
                <Layout>
                  <KnowledgePage />
                </Layout>
              </ModuleRouteGuard>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/canned-replies"
          element={(
            <ProtectedRoute>
              <ModuleRouteGuard moduleKey="cannedReplies">
                <Layout>
                  <CannedRepliesPage />
                </Layout>
              </ModuleRouteGuard>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/team"
          element={(
            <ProtectedRoute>
              <ModuleRouteGuard moduleKey="team">
                <Layout>
                  <TeamPage />
                </Layout>
              </ModuleRouteGuard>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/reports"
          element={(
            <ProtectedRoute>
              <ModuleRouteGuard moduleKey="reports">
                <Layout>
                  <ReportsPage />
                </Layout>
              </ModuleRouteGuard>
            </ProtectedRoute>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <BrowserRouter>
      <ProductSettingsProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ProductSettingsProvider>
    </BrowserRouter>
  );
}

export default App;
