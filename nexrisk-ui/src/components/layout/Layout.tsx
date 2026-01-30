// ============================================
// Main Layout Component
// Structure: TopBar | Sidebar + Content + AlertDrawer | BottomBar
// ============================================

import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { BottomBar } from './BottomBar';
import { AlertDrawer } from './AlertDrawer';

export function Layout() {
  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Top Bar */}
      <TopBar />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Navigation */}
        <Sidebar />

        {/* Center Working Space */}
        <main className="flex-1 overflow-auto bg-background">
          <Outlet />
        </main>

        {/* Right Alert Drawer */}
        <AlertDrawer />
      </div>

      {/* Bottom Bar */}
      <BottomBar />
    </div>
  );
}

export default Layout;
