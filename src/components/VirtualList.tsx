'use client';

import { useState, type ReactNode } from 'react';

import { getVisibleRange } from '@/lib/virtualWindow';

export interface VirtualListProps<T> {
  items: T[];
  /** Height of every row in pixels. Rows must all be the same height. */
  itemHeight: number;
  /** Height of the scrolling area in pixels. */
  height: number;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
  /** Rows rendered above and below the visible ones. */
  overscan?: number;
  ariaLabel?: string;
  className?: string;
}

/**
 * A scrolling list that renders only the rows in view (and a few more each side) instead of all
 * of them (#838). The full height is kept with a spacer, so the scrollbar and native smooth
 * scrolling behave as for a plain list. The area can be focused, so the keyboard can scroll it,
 * and each row says its position in the whole list for screen readers.
 */
export function VirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
  getKey,
  overscan,
  ariaLabel,
  className = '',
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const { start, end } = getVisibleRange({
    scrollTop,
    viewportHeight: height,
    itemHeight,
    itemCount: items.length,
    overscan,
  });

  return (
    <div
      role="list"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className={`relative overflow-y-auto ${className}`}
      style={{ height }}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        {items.slice(start, end).map((item, offset) => {
          const index = start + offset;
          return (
            <div
              key={getKey(item, index)}
              role="listitem"
              aria-posinset={index + 1}
              aria-setsize={items.length}
              style={{ position: 'absolute', top: index * itemHeight, left: 0, right: 0, height: itemHeight }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
