'use client';

import { useEffect, useRef } from 'react';

export interface ShortcutConfig {
  newWill?: string;
  search?: string;
  help?: string;
}

export interface UseKeyboardShortcutsProps {
  onNewWill?: () => void;
  onSearch?: () => void;
  onHelp?: () => void;
  shortcuts?: ShortcutConfig;
}

export function useKeyboardShortcuts(props: UseKeyboardShortcutsProps) {
  const { onNewWill, onSearch, onHelp, shortcuts } = props;

  const latestRef = useRef<UseKeyboardShortcutsProps>(props);
  latestRef.current = { onNewWill, onSearch, onHelp, shortcuts };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const { onNewWill: newWill, onSearch: search, onHelp: help, shortcuts: keys = {} } = latestRef.current;

      // Check if modifier keys are pressed (excluding Shift, which is needed for '?')
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const keyNewWill = keys.newWill || 'n';
      const keySearch = keys.search || '/';
      const keyHelp = keys.help || '?';

      if (event.key === keyNewWill && newWill) {
        event.preventDefault();
        newWill();
      } else if (event.key === keySearch && search) {
        event.preventDefault();
        search();
      } else if (event.key === keyHelp && help) {
        event.preventDefault();
        help();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
