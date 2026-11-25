import type { Metadata } from 'next';

import { Footer } from '@/components/Footer';

import { StatsContent } from './content';

export const metadata: Metadata = {
  title: 'Protocol Stats | SoroWill',
  description: 'Real-time statistics for the SoroWill protocol on Stellar',
};

export default function StatsPage() {
  return (
    <div className="space-y-8 pb-16">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold text-will-light">Protocol Stats</h1>
        <p className="text-will-light/60">
          Real-time statistics for SoroWill. No wallet connection required.
        </p>
      </section>

      <StatsContent />

      <Footer />
    </div>
  );
}
