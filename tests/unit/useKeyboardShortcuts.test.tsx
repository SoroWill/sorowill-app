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

  describe('listener stability across re-renders (#347)', () => {
    let addSpy: ReturnType<typeof vi.spyOn>;
    let removeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      addSpy = vi.spyOn(document, 'addEventListener');
      removeSpy = vi.spyOn(document, 'removeEventListener');
    });

    afterEach(() => {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('registers the keydown listener only once across many re-renders with inline props', () => {
      // Every render passes brand-new inline handlers and a brand-new
      // shortcuts object -- the exact shape of the dashboard call site.
      // Before the fix this re-registered the listener on every render.
      const { rerender } = renderHook(
        ({ nonce }: { nonce: number }) =>
          useKeyboardShortcuts({
            onNewWill: () => { void nonce; },
            onSearch: () => { void nonce; },
            onHelp: () => { void nonce; },
            shortcuts: { newWill: 'n' },
          }),
        { initialProps: { nonce: 0 } },
      );

      rerender({ nonce: 1 });
      rerender({ nonce: 2 });
      rerender({ nonce: 3 });
      rerender({ nonce: 4 });

      const keydownAddCalls = addSpy.mock.calls.filter(([type]: [string]) => type === 'keydown');
      expect(keydownAddCalls).toHaveLength(1);
      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('registers the keydown listener only once when shortcuts is omitted entirely', () => {
      const { rerender } = renderHook(
        ({ nonce }: { nonce: number }) =>
          useKeyboardShortcuts({ onNewWill: () => { void nonce; } }),
        { initialProps: { nonce: 0 } },
      );

      rerender({ nonce: 1 });
      rerender({ nonce: 2 });
      rerender({ nonce: 3 });

      const keydownAddCalls = addSpy.mock.calls.filter(([type]: [string]) => type === 'keydown');
      expect(keydownAddCalls).toHaveLength(1);
      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('invokes the newest handler after re-render (reads through the latest ref)', () => {
      const first = vi.fn();
      const second = vi.fn();

      const { rerender } = renderHook(
        ({ handler }: { handler: () => void }) =>
          useKeyboardShortcuts({ onNewWill: handler }),
        { initialProps: { handler: first } },
      );

      rerender({ handler: second });

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
      });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });

    it('reads updated shortcut keys through the latest ref without re-registering', () => {
      const onNewWill = vi.fn();

      const { rerender } = renderHook(
        ({ key }: { key: string }) =>
          useKeyboardShortcuts({ onNewWill, shortcuts: { newWill: key } }),
        { initialProps: { key: 'n' } },
      );

      rerender({ key: 'w' });

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      });

      expect(onNewWill).toHaveBeenCalledOnce();

      const keydownAddCalls = addSpy.mock.calls.filter(([type]: [string]) => type === 'keydown');
      expect(keydownAddCalls).toHaveLength(1);
    });

    it('still removes the keydown listener on unmount', () => {
      const { unmount } = renderHook(() => useKeyboardShortcuts({ onNewWill: vi.fn() }));

      unmount();

      const keydownRemoveCalls = removeSpy.mock.calls.filter(([type]: [string]) => type === 'keydown');
      expect(keydownRemoveCalls).toHaveLength(1);
    });
  });
});
