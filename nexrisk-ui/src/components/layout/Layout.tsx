import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { BottomBar } from './BottomBar';
import { PortfolioStatsProvider } from '@/stores/PortfolioStatsContext';

export function Layout() {
  return (
    <PortfolioStatsProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
        <TopBar />
        <main className="flex-1 overflow-hidden h-full bg-background">
          <Outlet />
        </main>
        <BottomBar />
      </div>
    </PortfolioStatsProvider>
  );
}

export default Layout;