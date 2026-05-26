import { Layout, Menu } from 'antd';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AnalyticsPage } from './pages/Analytics';
import { MaterialLibraryPage } from './pages/MaterialLibrary';
import { NewVideoPage } from './pages/NewVideo';
import { PreviewPage } from './pages/Preview';
import { TaskDetailPage } from './pages/TaskDetail';

const { Header, Content } = Layout;

const menuItems = [
  { key: '/materials', label: <Link to="/materials">Materials</Link> },
  { key: '/new', label: <Link to="/new">New Video</Link> },
  { key: '/analytics', label: <Link to="/analytics">Analytics</Link> },
];

export function App() {
  const location = useLocation();
  const selected = menuItems.find((m) => location.pathname.startsWith(m.key))?.key ?? '/new';

  return (
    <Layout className="app-shell">
      <Header className="app-shell__header">
        <div className="app-shell__brand">AIGC Video Studio</div>
        <Menu
          mode="horizontal"
          selectedKeys={[selected]}
          items={menuItems}
          style={{ flex: 1, justifyContent: 'flex-end', borderBottom: 'none' }}
        />
      </Header>
      <Content className="app-shell__content">
        <Routes>
          <Route path="/" element={<Navigate to="/new" replace />} />
          <Route path="/materials" element={<MaterialLibraryPage />} />
          <Route path="/new" element={<NewVideoPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/tasks/:id/preview" element={<PreviewPage />} />
          <Route path="*" element={<Navigate to="/new" replace />} />
        </Routes>
      </Content>
    </Layout>
  );
}
