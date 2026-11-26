import type { Metadata } from 'next';
import { AddressBookManager } from '@/components/AddressBook';

export const metadata: Metadata = {
  title: 'Address book | SoroWill',
  description: 'Save frequently used Stellar addresses with labels and tags.',
};

/** Address book management (#888). */
export default function AddressBookPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-will-light">Address book</h1>
        <p className="mt-1 text-sm text-will-light/60">
          Save addresses you use often, with a label and tags, and pick them when creating a will.
        </p>
      </div>
      <AddressBookManager />
    </div>
  );
}
