import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { BottomBar } from './BottomBar';

export function Layout() {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>
      <TopBar />
      <div className="flex-1 flex overflow-hidden gap-2 p-2">
        <Sidebar />
        <main className="flex-1 overflow-auto rounded" style={{ backgroundColor: '#313032' }}>
          <Outlet />
        </main>
      </div>
      <BottomBar />
    </div>
  );
}

export default Layout;
