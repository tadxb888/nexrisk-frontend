import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { BottomBar } from './BottomBar';
import { PortfolioStatsProvider } from '@/stores/PortfolioStatsContext';

export function Layout() {
  return (
    <PortfolioStatsProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
        <TopBar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden h-full bg-background">
            <Outlet />
          </main>
        </div>
        <BottomBar />
      </div>
    </PortfolioStatsProvider>
  );
}

export default Layout;