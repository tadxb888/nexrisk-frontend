// ============================================
// Sidebar Component
// Navigation with icon-only collapse/expand
// ============================================

import { NavLink, useLocation } from 'react-router-dom';
import { useUIStore } from '@/stores';
import { clsx } from 'clsx';

// SVG Icons - Clean, minimal, institutional
const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M10 12L6 8L10 4" />
  </svg>
);

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M6 12L10 8L6 4" />
  </svg>
);

interface NavItem {
  label: string;
  path: string;
  section?: string;
}

const navItems: NavItem[] = [
  // Main
  { label: 'Cockpit', path: '/', section: 'main' },
  
  // RIAN Section
  { label: 'Portfolio', path: '/portfolio', section: 'rian' },
  { label: 'Focus', path: '/focus', section: 'rian' },
  { label: 'B-Book', path: '/b-book', section: 'rian' },
  { label: 'A-Book', path: '/a-book', section: 'rian' },
  { label: 'C-Book', path: '/c-book', section: 'rian' },
  { label: 'Net-Exposure', path: '/net-exposure', section: 'rian' },
  
  // Configuration
  { label: 'Charter', path: '/charter', section: 'config' },
  { label: 'Liquidity Providers', path: '/liquidity-providers', section: 'config' },
  { label: 'Hedge Rules', path: '/hedge-rules', section: 'config' },
  { label: 'Price Rules', path: '/price-rules', section: 'config' },
  
  // Reports
  { label: 'Execution Report', path: '/execution-report', section: 'reports' },
  { label: 'Logs', path: '/logs', section: 'reports' },
];

export function Sidebar() {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside
      className={clsx(
        'h-full bg-[#313032] border-r border-[#808080] flex flex-col transition-all duration-200',
        sidebarCollapsed ? 'w-12' : 'w-52'
      )}
    >
      {/* Logo */}
      <div className="h-12 flex items-center justify-between px-3 border-b border-[#808080] shrink-0">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-accent flex items-center justify-center">
              <span className="text-text-primary font-semibold text-sm">N</span>
            </div>
            <span className="font-semibold text-text-primary text-sm">NexRisk</span>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="w-7 h-7 rounded bg-accent flex items-center justify-center mx-auto">
            <span className="text-text-primary font-semibold text-sm">N</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        <div className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path !== '/' && location.pathname.startsWith(item.path));

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center px-2 py-1.5 rounded text-sm transition-colors',
                  isActive
                    ? 'bg-accent-subtle text-accent font-medium'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                  sidebarCollapsed && 'justify-center'
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                {!sidebarCollapsed && (
                  <span className="truncate">{item.label}</span>
                )}
                {sidebarCollapsed && (
                  <span className="text-xs font-medium">
                    {item.label.charAt(0)}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Collapse Toggle - ICON ONLY as per mockup */}
      <div className="p-2 border-t border-[#808080] shrink-0">
        <button
          onClick={toggleSidebar}
          className={clsx(
            'w-full flex items-center justify-center p-2 rounded',
            'text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors'
          )}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
