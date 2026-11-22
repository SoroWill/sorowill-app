'use client';

import { useEffect, useState, type MouseEvent } from 'react';

export interface FaqNavItem {
  /** Id of the element to scroll to. */
  id: string;
  label: string;
}

export interface FaqNavProps {
  heading: string;
  items: FaqNavItem[];
  backToTopLabel: string;
}

/** Scroll distance (px) after which the "Back to top" button appears. */
const BACK_TO_TOP_THRESHOLD = 600;

function scrollBehavior(): ScrollBehavior {
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduce ? 'auto' : 'smooth';
}

/**
 * Table of contents for the FAQ page (#814). On phones it is a sticky bar under the header
 * with a collapsible list; from the `sm` breakpoint up the list is always shown. Selecting an
 * entry scrolls to it smoothly, opens it when it is a `<details>` question, and updates the URL
 * hash so the section can be linked to.
 */
export function FaqNav({ heading, items, backToTopLabel }: FaqNavProps) {
  const [expanded, setExpanded] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > BACK_TO_TOP_THRESHOLD);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function handleSelect(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    if (target instanceof HTMLDetailsElement) target.open = true;
    target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
    setExpanded(false);
  }

  return (
    <>
      <nav
        aria-label={heading}
        className="sticky top-16 z-[5] -mx-4 border-b border-white/10 bg-will-dark/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border sm:bg-white/5 sm:px-6 sm:py-4"
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls="faq-nav-list"
          className="flex w-full items-center justify-between text-sm font-semibold text-will-light sm:hidden"
        >
          <span>{heading}</span>
          <span aria-hidden="true" className={`text-will-purple transition ${expanded ? 'rotate-90' : ''}`}>
            ▸
          </span>
        </button>
        <p className="hidden text-sm font-semibold text-will-light sm:block">{heading}</p>
        <ol
          id="faq-nav-list"
          className={`${expanded ? 'grid' : 'hidden'} mt-3 max-h-[60vh] gap-1 overflow-y-auto text-sm text-will-light/70 sm:grid sm:max-h-none sm:grid-cols-2 sm:overflow-visible`}
        >
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(event) => handleSelect(event, item.id)}
                className="block rounded px-2 py-1 hover:bg-white/10 hover:text-will-light focus:outline-none focus-visible:ring-1 focus-visible:ring-will-purple"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
          className="fixed bottom-6 right-6 z-20 rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-will-purple/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-will-light"
        >
          {backToTopLabel}
        </button>
      )}
    </>
  );
}
