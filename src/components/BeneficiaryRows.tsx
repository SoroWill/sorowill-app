'use client';

import { CopyAddress } from '@/components/CopyAddress';
import { VirtualList } from '@/components/VirtualList';
import { VIRTUALIZE_THRESHOLD } from '@/lib/virtualWindow';

export interface BeneficiaryRow {
  address: string;
  /** Text shown at the right of the row, for example "40%" or "250 USDC". */
  value: string;
}

/** Height of one row, and of the scrolling area once the list is long. */
const ROW_HEIGHT = 32;
const VIRTUAL_LIST_HEIGHT = 320;

function Row({ row }: { row: BeneficiaryRow }) {
  return (
    <div className="flex h-full items-center justify-between text-sm">
      <CopyAddress address={row.address} className="text-will-light/80" />
      <span className="text-will-light">{row.value}</span>
    </div>
  );
}

/**
 * A read-only list of beneficiaries. A short list is a plain list; one with more than
 * `VIRTUALIZE_THRESHOLD` rows scrolls in a fixed-height area that renders only the rows in view (#838).
 */
export function BeneficiaryRows({ rows }: { rows: BeneficiaryRow[] }) {
  if (rows.length > VIRTUALIZE_THRESHOLD) {
    return (
      <VirtualList
        className="mt-2"
        ariaLabel={`Beneficiaries (${rows.length})`}
        items={rows}
        itemHeight={ROW_HEIGHT}
        height={VIRTUAL_LIST_HEIGHT}
        getKey={(row) => row.address}
        renderItem={(row) => <Row row={row} />}
      />
    );
  }

  return (
    <ul className="mt-2 space-y-1.5">
      {rows.map((row) => (
        <li key={row.address} className="flex justify-between text-sm">
          <CopyAddress address={row.address} className="text-will-light/80" />
          <span className="text-will-light">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}
