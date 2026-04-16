// ============================================
// SubNav — Layer 2 Navigation
// Shows sub-items for the active primary section.
// Each item can be pinned to the favourites bar.
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/stores/AuthContext';
import { clsx } from 'clsx';
import { NAV_SECTIONS, sectionForPath, loadPins, savePins } from './TopBar';

// Pin icon (tiny pushpin)
const PinIcon = ({ filled }: { filled: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
    <path d="M12 2L12 8M8 8H16L14 14H10L8 8ZM10 14L9 22M14 14L15 22" />
  </svg>
);

export function SubNav() {
  const location = useLocation();
  const { user } = useAuth();
  const canManageUsers = user?.role === 'root' || user?.role === 'administrator';

  const [pins, setPins] = useState<string[]>(loadPins);

  // Sync when TopBar unpins
  useEffect(() => {
    const sync = () => setPins(loadPins());
    window.addEventListener('taiga:pins-changed', sync);
    return () => window.removeEventListener('taiga:pins-changed', sync);
  }, []);

  const togglePin = useCallback((path: string) => {
    setPins(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path];
      savePins(next);
      // Dispatch storage event so TopBar re-reads (same-tab workaround)
      window.dispatchEvent(new Event('taiga:pins-changed'));
      return next;
    });
  }, []);

  const section = sectionForPath(location.pathname);
  if (!section) return null;

  const visibleItems = section.items.filter(i => !i.adminOnly || canManageUsers);
  if (visibleItems.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1 px-4 shrink-0"
      style={{
        height: 34,
        backgroundColor: '#2a292c',
        borderBottom: '1px solid #3a3a3e',
      }}
    >
      {/* Section label */}
      <span
        style={{
          fontSize: 9,
          color: '#aaa',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginRight: 8,
          userSelect: 'none',
        }}
      >
        {section.label}
      </span>

      {/* Sub-items */}
      {visibleItems.map(item => {
        const isActive = location.pathname === item.path;
        const pinned = pins.includes(item.path);

        return (
          <div key={item.path} className="flex items-center group">
            <NavLink
              to={item.path}
              className={clsx(
                'relative px-3 py-1 text-[12px] rounded transition-colors',
                isActive
                  ? 'font-medium'
                  : 'text-white hover:text-[#c9b87c]'
              )}
              style={isActive ? { color: '#c9b87c', backgroundColor: 'rgba(201,184,124,0.1)' } : undefined}
            >
              {item.label}
              {isActive && (
                <div
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                  style={{ backgroundColor: '#c9b87c' }}
                />
              )}
            </NavLink>

            {/* Pin toggle — visible on hover or if already pinned */}
            <button
              onClick={() => togglePin(item.path)}
              className={clsx(
                'transition-opacity ml-[-4px] mr-1',
                pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-80 hover:!opacity-100'
              )}
              style={{
                color: '#fff',
                padding: 2,
                lineHeight: 1,
              }}
              title={pinned ? 'Unpin' : 'Pin to favourites'}
            >
              <PinIcon filled={pinned} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default SubNav;