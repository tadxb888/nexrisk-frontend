// ============================================
// useHelp — tiny hook for sub-pages to wire up the help drawer
//
// Usage in a sub-page:
//   import helpContent from './help/01-gateway.md?raw';
//   const help = useHelp();
//   ...
//   <HelpIcon onClick={help.open} />
//   <HelpDrawer open={help.isOpen} title="Price feed gateway" content={helpContent} onClose={help.close} />
// ============================================

import { useCallback, useState } from 'react';

export interface UseHelpReturn {
  isOpen: boolean;
  open:   () => void;
  close:  () => void;
  toggle: () => void;
}

export function useHelp(): UseHelpReturn {
  const [isOpen, setIsOpen] = useState(false);
  const open   = useCallback(() => setIsOpen(true),  []);
  const close  = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(o => !o), []);
  return { isOpen, open, close, toggle };
}