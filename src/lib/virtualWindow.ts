/** Lists longer than this are rendered through the virtual list; shorter ones are plain lists (#838). */
export const VIRTUALIZE_THRESHOLD = 50;

export interface VisibleRange {
  /** Index of the first item to render. */
  start: number;
  /** Index after the last item to render. */
  end: number;
}

export interface VisibleRangeInput {
  scrollTop: number;
  viewportHeight: number;
  itemHeight: number;
  itemCount: number;
  /** Extra items rendered above and below the viewport so fast scrolling does not show gaps. */
  overscan?: number;
}

/**
 * Which items of a list of equal-height rows are on screen, plus the overscan on each side.
 * The result is always inside `0..itemCount`, whatever the scroll position.
 */
export function getVisibleRange({
  scrollTop,
  viewportHeight,
  itemHeight,
  itemCount,
  overscan = 5,
}: VisibleRangeInput): VisibleRange {
  if (itemCount <= 0 || itemHeight <= 0) return { start: 0, end: 0 };

  const top = Math.max(0, scrollTop);
  const first = Math.floor(top / itemHeight);
  const last = Math.ceil((top + Math.max(0, viewportHeight)) / itemHeight);

  const start = Math.min(itemCount, Math.max(0, first - overscan));
  const end = Math.min(itemCount, Math.max(start, last + overscan));
  return { start, end };
}
