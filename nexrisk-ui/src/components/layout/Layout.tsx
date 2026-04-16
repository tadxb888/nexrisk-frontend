import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { SubNav } from './SubNav';
import { BottomBar } from './BottomBar';

export function Layout() {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      <TopBar />
      <SubNav />
      <main className="flex-1 overflow-hidden h-full bg-background">
        <Outlet />
      </main>
      <BottomBar />
    </div>
  );
}

export default Layout;