import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import SessionViewerPage from './pages/SessionViewerPage';
import ChatPage from './pages/ChatPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectsPage />} />
        <Route path="/projects/:projectId/sessions/:sessionId" element={<SessionViewerPage />} />
      </Routes>
    </Layout>
  );
}
