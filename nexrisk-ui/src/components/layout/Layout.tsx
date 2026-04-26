import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { SubNav } from './SubNav';
import { BottomBar } from './BottomBar';
import { PortfolioStatsProvider } from '@/stores/PortfolioStatsContext';

export function Layout() {
  return (
    <PortfolioStatsProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
        <TopBar />
        <SubNav />
        <main className="flex-1 overflow-hidden h-full bg-background">
          <Outlet />
        </main>
        <BottomBar />
      </div>
    </PortfolioStatsProvider>
  );
}

export default Layout;