// ============================================
// SubNav — Layer 2 Navigation
// Shows sub-items for the active primary section.
// Each item can be pinned to the favourites bar.
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/stores/AuthContext';
import { clsx } from 'clsx';
import { NAV_SECTIONS, sectionForPath, loadPins, savePins, canSeeItem } from './TopBar';

// Thumbtack pin icon
const PinIcon = ({ filled }: { filled: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
    <path d="M9.068,16.347l4.9,4.9.707-.707a7.977,7.977,0,0,0,2.075-7.619l-.246-1,2.086-2.086.217.217a3.085,3.085,0,0,0,3.938.4,3,3,0,0,0,.38-4.565L18.2.954a3.085,3.085,0,0,0-3.938-.4,3,3,0,0,0-.38,4.565l.293.293L12.085,7.5,11.1,7.258A7.985,7.985,0,0,0,3.464,9.33l-.707.707,4.9,4.895L.293,22.293l1.414,1.414Z" />
  </svg>
);

export function SubNav() {
  const location = useLocation();
  const { user } = useAuth();

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

  const visibleItems = section.items.filter(i => canSeeItem(i, user?.role));
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
                'relative flex items-center gap-1.5 px-3 py-1 text-[12px] rounded transition-colors',
                isActive
                  ? 'font-medium'
                  : 'text-white hover:text-[#c9b87c]'
              )}
              style={isActive ? { color: '#c9b87c', backgroundColor: '#2a1f14' } : undefined}
            >
              {item.label}

              {/* Pin toggle — inside the item box */}
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); togglePin(item.path); }}
                className={clsx(
                  pinned ? 'inline-flex' : 'hidden group-hover:inline-flex'
                )}
                style={{
                  color: '#fff',
                  padding: 1,
                  lineHeight: 1,
                  alignItems: 'center',
                }}
                title={pinned ? 'Unpin' : 'Pin to favourites'}
              >
                <PinIcon filled={pinned} />
              </button>

              {isActive && (
                <div
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                  style={{ backgroundColor: '#c9b87c' }}
                />
              )}
            </NavLink>
          </div>
        );
      })}
    </div>
  );
}

export default SubNav;