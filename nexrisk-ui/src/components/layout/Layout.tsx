import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { BottomBar } from './BottomBar';

export function Layout() {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden h-full bg-background">
          <Outlet />
        </main>
      </div>
      <BottomBar />
    </div>
  );
}

export default Layout;