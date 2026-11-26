'use client';

import { useId, useState } from 'react';
import type { Beneficiary } from '@sorowill/sdk';
import { MAX_CSV_BYTES, parseBeneficiaryCsv, type BeneficiaryCsvResult } from '@/lib/beneficiaryCsv';

/** Reads a file as text; falls back to FileReader where `File.text()` is unavailable. */
function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

/**
 * Bulk beneficiary import from a CSV file (#887): upload → validated preview → import.
 * Importing replaces the current beneficiary rows. The rows stay editable in the form.
 */
export function BeneficiaryCsvImport({ onImport }: { onImport: (beneficiaries: Beneficiary[]) => void }) {
  const inputId = useId();
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<BeneficiaryCsvResult | null>(null);
  const [fileError, setFileError] = useState('');

  async function handleFile(file: File | undefined) {
    setResult(null);
    setFileError('');
    if (!file) return;
    setFileName(file.name);
    if (file.size > MAX_CSV_BYTES) {
      setFileError(`The file is larger than ${MAX_CSV_BYTES / 1024} KB.`);
      return;
    }
    try {
      setResult(parseBeneficiaryCsv(await readText(file)));
    } catch {
      setFileError('The file could not be read.');
    }
  }

  function reset() {
    setResult(null);
    setFileName('');
    setFileError('');
  }

  const canImport = !!result && result.errors.length === 0 && result.rows.length > 0;

  return (
    <section aria-label="Import beneficiaries from CSV" className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-will-light">Import from CSV</h3>
        <p className="text-xs text-will-light/60">
          One per line: <code>address,percentage[,label]</code>
        </p>
      </div>
      <label htmlFor={inputId} className="block text-xs text-will-light/80">
        CSV file
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="mt-1 block text-xs"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </label>

      {fileError ? (
        <p role="alert" className="text-xs text-red-300">{fileError}</p>
      ) : null}

      {result ? (
        <div className="space-y-2">
          <p className="text-xs text-will-light/70">
            {fileName}: {result.rows.length} valid row{result.rows.length === 1 ? '' : 's'}, total {result.total}%
          </p>
          {result.rows.length > 0 ? (
            <table className="w-full text-left text-xs" aria-label="Import preview">
              <thead>
                <tr className="text-will-light/50">
                  <th scope="col" className="py-1">Line</th>
                  <th scope="col" className="py-1">Address</th>
                  <th scope="col" className="py-1">Share</th>
                  <th scope="col" className="py-1">Label</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.line}>
                    <td className="py-0.5 text-will-light/60">{row.line}</td>
                    <td className="py-0.5 font-mono" title={row.address}>{short(row.address)}</td>
                    <td className="py-0.5">{row.percentage}%</td>
                    <td className="py-0.5 text-will-light/70">{row.label ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {result.errors.length > 0 ? (
            <ul role="alert" aria-label="Import errors" className="space-y-0.5 text-xs text-red-300">
              {result.errors.map((issue) => (
                <li key={`${issue.line}-${issue.message}`}>
                  {issue.line > 0 ? `Line ${issue.line}: ` : ''}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          {result.warnings.map((issue) => (
            <p key={issue.message} className="text-xs text-amber-300">{issue.message}</p>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canImport}
              onClick={() => {
                if (!result) return;
                onImport(result.rows.map((row) => ({ address: row.address, percentage: row.percentage })));
                reset();
              }}
              className="rounded-full bg-will-purple px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Import {result.rows.length} beneficiar{result.rows.length === 1 ? 'y' : 'ies'}
            </button>
            <button type="button" onClick={reset} className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-will-light/80">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
