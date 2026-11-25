'use client';

import { useEffect, useId, useState } from 'react';

export function useAddressHistory(scope: string, isValid: (address: string) => boolean) {
  const key = 'sorowill:address-history:' + scope;
  const id = useId();
  const [history, setHistory] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      if (Array.isArray(stored)) {
        setHistory(stored.filter((address): address is string => typeof address === 'string').slice(0, 10));
      }
    } catch {
      // History is optional when browser storage is unavailable.
    }
  }, [key]);

  function save(addresses: string[] | null) {
    setHistory(addresses);
    try {
      if (addresses === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(addresses));
    } catch {
      // Suggestions can still be used in this form.
    }
  }

  function remember(value: string) {
    const address = value.trim();
    if (history && isValid(address)) {
      save([address, ...history.filter((previous) => previous !== address)].slice(0, 10));
    }
  }

  return {
    list: history?.some(isValid) ? id : undefined,
    remember,
    controls: (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-will-light/80">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={history !== null} onChange={(event) => save(event.target.checked ? [] : null)} />
          Remember Addresses in This Tab
        </label>
        {!!history?.length && (
          <button type="button" className="underline" onClick={() => save([])}>Clear Address History</button>
        )}
        <datalist id={id}>
          {history?.filter(isValid).map((address) => <option key={address} value={address} />)}
        </datalist>
      </div>
    ),
  };
}
