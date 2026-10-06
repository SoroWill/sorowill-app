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

  // Keep the latest props in a ref so the keydown listener can read fresh
  // closures without being re-registered. Assigning during render (rather
  // than inside an effect) closes the window between commit and effect flush
  // where a fast keystroke could otherwise invoke stale handlers.
  //
  // This is the "latest ref" pattern: identity of `shortcuts` and the
  // handler callbacks is intentionally ignored by the effect below, so
  // callers may pass inline objects/arrows without triggering churn.
  const latestRef = useRef<UseKeyboardShortcutsProps>(props);
  latestRef.current = { onNewWill, onSearch, onHelp, shortcuts };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Check if modifier keys are pressed (excluding Shift, which is needed for '?')
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

export function useKeyboardShortcuts(props: UseKeyboardShortcutsProps) {
  // Keep the latest handlers/config in a ref so the keydown listener can stay
  // registered for the lifetime of the component, even when callers pass
  // inline (non-memoized) callbacks or a fresh `shortcuts` object each render.
  const latestProps = useRef(props);
  useIsomorphicLayoutEffect(() => {
    latestProps.current = props;
  });

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const { onNewWill, onSearch, onHelp, shortcuts = {} } = latestProps.current;

    // Check if modifier keys are pressed (excluding Shift, which is needed for '?')
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
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
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
