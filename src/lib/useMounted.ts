'use client';

import { useState, useEffect } from 'react';

/**
 * Returns `true` after the component has mounted on the client.
 *
 * Use this to guard against SSR / hydration mismatches: render a skeleton
 * while `!mounted` and the real content once `mounted` is true.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
