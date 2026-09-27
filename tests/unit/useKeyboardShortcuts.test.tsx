import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should trigger "new will" shortcut when "n" key is pressed', () => {
    const onNewWill = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNewWill }));

    const event = new KeyboardEvent('keydown', { key: 'n' });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(onNewWill).toHaveBeenCalledOnce();
  });

  it('should trigger "search" shortcut when "/" key is pressed', () => {
    const onSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSearch }));

    const event = new KeyboardEvent('keydown', { key: '/' });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(onSearch).toHaveBeenCalledOnce();
  });

  it('should trigger "help" shortcut when "?" key is pressed', () => {
    const onHelp = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelp }));

    const event = new KeyboardEvent('keydown', { key: '?', shiftKey: true });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(onHelp).toHaveBeenCalledOnce();
  });

  it('should not trigger shortcuts when modifier keys are pressed', () => {
    const onNewWill = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNewWill }));

    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(onNewWill).not.toHaveBeenCalled();
  });

  it('should not trigger shortcuts when input element is focused', () => {
    const onNewWill = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNewWill }), {
      wrapper: ({ children }) => {
        return <div>{children}</div>;
      },
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', { key: 'n' });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(onNewWill).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('should not trigger shortcuts when textarea element is focused', () => {
    const onNewWill = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNewWill }));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    const event = new KeyboardEvent('keydown', { key: 'n' });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(onNewWill).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it('should not trigger shortcuts when contenteditable element is focused', () => {
    const onNewWill = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNewWill }));

    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.tabIndex = 0;
    document.body.appendChild(div);
    div.focus();

    const event = new KeyboardEvent('keydown', { key: 'n' });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(onNewWill).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  it('should cleanup event listeners on unmount', () => {
    const onNewWill = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcuts({ onNewWill }));

    unmount();

    const event = new KeyboardEvent('keydown', { key: 'n' });
    document.dispatchEvent(event);

    expect(onNewWill).not.toHaveBeenCalled();
  });

  it('should support configurable shortcut keys', () => {
    const onNewWill = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        onNewWill,
        shortcuts: { newWill: 'w' }
      })
    );

    const event = new KeyboardEvent('keydown', { key: 'w' });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(onNewWill).toHaveBeenCalledOnce();
  });

  it('registers keydown listener once and does not re-attach on parent re-renders (#451)', () => {
    const addListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeListenerSpy = vi.spyOn(document, 'removeEventListener');

    let handlerA = vi.fn();
    let handlerB = vi.fn();

    const { rerender } = renderHook(
      ({ handler }) => useKeyboardShortcuts({ onNewWill: handler }),
      { initialProps: { handler: handlerA } },
    );

    // Initial mount attaches keydown listener once
    const initialKeydownListeners = addListenerSpy.mock.calls.filter(
      ([event]) => event === 'keydown',
    );
    expect(initialKeydownListeners).toHaveLength(1);

    // Re-render multiple times with new handler function references
    rerender({ handler: handlerB });
    rerender({ handler: handlerB });

    // Listener count should remain exactly 1 (not re-attached)
    const afterRerenderKeydownListeners = addListenerSpy.mock.calls.filter(
      ([event]) => event === 'keydown',
    );
    expect(afterRerenderKeydownListeners).toHaveLength(1);
    expect(removeListenerSpy).not.toHaveBeenCalled();

    // Trigger keydown: verify it calls the latest handler (handlerB), not stale handlerA
    const event = new KeyboardEvent('keydown', { key: 'n' });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledOnce();

    addListenerSpy.mockRestore();
    removeListenerSpy.mockRestore();
  });
});
