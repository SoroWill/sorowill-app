import Link from 'next/link';

const STEPS = [
  {
    title: 'Lock USDC',
    description: 'Deposit USDC into a SoroWill contract and name your beneficiaries with percentage splits.',
  },
  {
    title: 'Check in regularly',
    description: 'Prove you’re still active with a simple check-in before your deadline passes.',
  },
  {
    title: 'Miss a check-in triggers grace period',
    description: 'If you miss the deadline, anyone can trigger the will — starting a grace period for you to respond.',
  },
  {
    title: 'Funds release to heirs automatically',
    description: 'If the grace period expires without a response, the contract splits your USDC to your beneficiaries.',
  },
];

const WHY = [
  {
    title: 'Trustless',
    description: 'No lawyer, no court, no middleman. The contract enforces the outcome exactly as configured.',
  },
  {
    title: 'Automatic',
    description: 'Anyone can trigger a missed check-in or release funds once conditions are met — no gatekeeper required.',
  },
  {
    title: 'Reversible',
    description: 'Cancel anytime while you’re active, or update your beneficiaries whenever your circumstances change.',
  },
];

export default function LandingPage() {
  return (
    <div className="space-y-24 pb-16">
      <section className="flex flex-col items-center gap-6 pt-8 text-center sm:pt-16">
        <span className="rounded-full border border-will-purple/40 bg-will-purple/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-indigo-300">
          On Stellar Soroban
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-will-light sm:text-6xl">
          Protect your crypto legacy
        </h1>
        <p className="max-w-xl text-lg text-will-light/70">
          SoroWill is a trustless on-chain inheritance protocol. Lock USDC, name your beneficiaries, and let a
          smart contract carry out your wishes if you ever go silent.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/will/new"
            className="rounded-full bg-will-purple px-6 py-3 text-sm font-semibold text-white transition hover:bg-will-purple/90"
          >
            Create your Will
          </Link>
          <a
            href="https://github.com/icentedward76-sketch/sorowill-contracts"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-will-light/80 transition hover:border-white/40 hover:text-will-light"
          >
            View on GitHub
          </a>
        </div>
      </section>

      <section>
        <h2 className="text-center text-2xl font-bold text-will-light">How it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <div key={step.title} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <span className="text-sm font-mono text-will-purple">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="mt-2 font-semibold text-will-light">{step.title}</h3>
              <p className="mt-1 text-sm text-will-light/60">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-center text-2xl font-bold text-will-light">Why SoroWill</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {WHY.map((item) => (
            <div key={item.title} className="rounded-xl border border-white/10 bg-will-light/5 p-6 text-center">
              <h3 className="text-lg font-semibold text-will-light">{item.title}</h3>
              <p className="mt-2 text-sm text-will-light/60">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex flex-col items-center gap-2 border-t border-white/10 pt-8 text-center text-sm text-will-light/50">
        <p>SoroWill, built on Stellar</p>
        <div className="flex items-center gap-4">
          <span>MIT License</span>
          <a
            href="https://github.com/icentedward76-sketch/sorowill-app"
            target="_blank"
            rel="noreferrer"
            className="hover:text-will-light"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
