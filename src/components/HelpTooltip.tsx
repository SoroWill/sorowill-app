'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';

interface HelpTooltipProps {
  /** Short field name, used for the button's accessible label. */
  label: string;
  /** The explanation shown in the tooltip. */
  text: string;
  /** Optional docs link for more detail. */
  docsHref?: string;
}

/**
 * A help icon next to a form label (#884). The explanation appears on hover
 * and keyboard focus, and toggles on tap for touch screens; Escape or a tap
 * outside closes it. The tooltip is linked with aria-describedby so screen
 * readers announce it with the button.
 */
export function HelpTooltip({ label, text, docsHref }: HelpTooltipProps) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const tooltipId = `help-${id}`;
  const rootRef = useRef<HTMLSpanElement>(null);
  const open = hovered || pinned;

  useEffect(() => {
    if (!pinned) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setPinned(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pinned]);

  return (
    <span
      ref={rootRef}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setHovered(false);
          setPinned(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={`Help: ${label}`}
        aria-describedby={tooltipId}
        aria-expanded={open}
        onClick={() => setPinned((current) => !current)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/30 text-[10px] font-bold text-will-light/70 hover:border-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-will-purple"
      >
        ?
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        hidden={!open}
        className="absolute left-0 top-6 z-20 w-64 max-w-[80vw] rounded-lg border border-white/10 bg-will-dark p-3 text-left text-xs font-normal text-will-light/80 shadow-lg"
      >
        {text}
        {docsHref ? (
          <>
            {' '}
            <Link href={docsHref} className="text-will-purple underline">
              Learn more
            </Link>
          </>
        ) : null}
      </span>
    </span>
  );
}
