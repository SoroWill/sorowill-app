'use client';

export default function NewWillError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
      <h1 className="text-lg font-semibold text-red-300">Something went wrong</h1>
      <p className="mt-2 text-sm text-red-300/70">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:border-red-400/70"
      >
        Try again
      </button>
    </div>
  );
}
