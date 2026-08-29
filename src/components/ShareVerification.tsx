'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function ShareVerification() {
  const [url, setUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUrl(window.location.href);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 200,
      color: { dark: '#7D00FF', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error('Failed to generate QR code: ', err);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }

  if (!mounted) {
    return <div className="h-48 w-full rounded-xl bg-white/5 animate-pulse" />;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 flex flex-col items-center gap-4 text-center">
      <h3 className="text-sm font-semibold text-will-light">Share this verification page</h3>
      <p className="text-xs text-will-light/60">
        Beneficiaries or third parties can scan the QR code or use the link to verify the real-time status of this will on-chain. No wallet required.
      </p>

      {/* QR Code Container */}
      <div className="p-3 bg-white rounded-lg shadow-lg transition-transform hover:scale-105 duration-200">
        {qrDataUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={qrDataUrl}
            alt="Verification Page QR Code"
            width={180}
            height={180}
            decoding="async"
            className="rounded"
          />
        ) : (
          <div className="h-[180px] w-[180px] rounded bg-black/5 animate-pulse" />
        )}
      </div>

      {/* Action Area */}
      <div className="w-full flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          readOnly
          value={url}
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-will-light/80 outline-none"
        />
        <button
          type="button"
          onClick={handleCopy}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
            copied
              ? 'bg-emerald-500 text-white'
              : 'bg-will-purple text-white hover:bg-will-purple/90'
          }`}
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}
