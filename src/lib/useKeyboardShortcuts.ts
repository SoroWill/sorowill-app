'use client';

import { useEffect, useRef, useCallback } from 'react';

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
  const propsRef = useRef({ onNewWill, onSearch, onHelp, shortcuts });

  useEffect(() => {
    propsRef.current = { onNewWill, onSearch, onHelp, shortcuts };
  });

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
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

    const {
      onNewWill: currentOnNewWill,
      onSearch: currentOnSearch,
      onHelp: currentOnHelp,
      shortcuts: currentShortcuts,
    } = propsRef.current;

    // Define default keys and overrides
    const keyNewWill = currentShortcuts?.newWill || 'n';
    const keySearch = currentShortcuts?.search || '/';
    const keyHelp = currentShortcuts?.help || '?';

    if (event.key === keyNewWill && currentOnNewWill) {
      event.preventDefault();
      currentOnNewWill();
    } else if (event.key === keySearch && currentOnSearch) {
      event.preventDefault();
      currentOnSearch();
    } else if (event.key === keyHelp && currentOnHelp) {
      event.preventDefault();
      currentOnHelp();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
