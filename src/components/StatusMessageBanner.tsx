'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export type StatusMessageVariant = 'success' | 'info' | 'error';

/** How long a success or info message stays before it dismisses itself. */
export const STATUS_MESSAGE_AUTO_DISMISS_MS = 5_000;

const VARIANT_CLASS: Record<StatusMessageVariant, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  info: 'border-white/20 bg-white/5 text-will-light/80',
  error: 'border-red-500/30 bg-red-500/10 text-red-300',
};

export interface StatusMessageBannerProps {
  variant: StatusMessageVariant;
  children: ReactNode;
  /** Called when the message goes away, by the timer or by the person, so the owner can clear it. */
  onDismiss?: () => void;
  /** Milliseconds before success and info messages dismiss themselves. Errors never do. */
  autoDismissMs?: number;
}

/**
 * Banner for the result of an action (#829). Success and info messages dismiss themselves after
 * five seconds. The timer pauses while the pointer is over the banner or focus is inside it, so a
 * slow reader or keyboard user is not rushed. Every message has a Dismiss button, Escape dismisses
 * it from the keyboard, and errors stay until they are dismissed.
 */
export function StatusMessageBanner({
  variant,
  children,
  onDismiss,
  autoDismissMs = STATUS_MESSAGE_AUTO_DISMISS_MS,
}: StatusMessageBannerProps) {
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const dismiss = useCallback(() => {
    setVisible(false);
    onDismissRef.current?.();
  }, []);

  useEffect(() => {
    if (variant === 'error' || paused || !visible) return;
    const timer = setTimeout(dismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [variant, paused, visible, autoDismissMs, dismiss]);

  if (!visible) return null;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      data-variant={variant}
      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${VARIANT_CLASS[variant]}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') dismiss();
      }}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss message"
        className="shrink-0 rounded px-1 text-xs font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        Dismiss
      </button>
    </div>
  );
}
