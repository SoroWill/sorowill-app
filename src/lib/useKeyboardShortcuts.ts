'use client';

import { useEffect } from 'react';

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

export function useKeyboardShortcuts({
  onNewWill,
  onSearch,
  onHelp,
  shortcuts = {},
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Check if modifier keys are pressed (excluding Shift, which is needed for '?')
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      // Check if focused element is an input, textarea, or contenteditable
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        const contentEditableAttr = activeEl.getAttribute('contenteditable');
        const htmlEl = activeEl as HTMLElement;
        const isContentEditable =
          contentEditableAttr === 'true' ||
          contentEditableAttr === '' ||
          htmlEl.contentEditable === 'true' ||
          (htmlEl as HTMLElement & { isContentEditable?: boolean }).isContentEditable === true;

        if (
          tagName === 'input' ||
          tagName === 'textarea' ||
          isContentEditable
        ) {
          return;
        }
      }

      // Define default keys and overrides
      const keyNewWill = shortcuts.newWill || 'n';
      const keySearch = shortcuts.search || '/';
      const keyHelp = shortcuts.help || '?';

      if (event.key === keyNewWill && onNewWill) {
        event.preventDefault();
        onNewWill();
      } else if (event.key === keySearch && onSearch) {
        event.preventDefault();
        onSearch();
      } else if (event.key === keyHelp && onHelp) {
        event.preventDefault();
        onHelp();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onNewWill, onSearch, onHelp, shortcuts]);
}
