'use client';

import { useEffect, useState } from 'react';
import { useMounted } from '@/lib/useMounted';
import { useToast } from '@/components/Toast';
import { QR_DISPLAY_SCALE, verificationQrOptions } from '@/lib/qrOptions';

/** `sorowill-verify-<id>.png` from a verification page URL such as `/verify/12`; falls back to a plain name. */
export function qrFileName(pageUrl: string): string {
  try {
    const id = new URL(pageUrl).pathname.split('/').filter(Boolean).pop();
    return id && /^[A-Za-z0-9_-]+$/.test(id) ? `sorowill-verify-${id}.png` : 'sorowill-verify.png';
  } catch {
    return 'sorowill-verify.png';
  }
}

/** Size of the downloaded QR image; larger than the one on screen so it prints and scans well. */
const QR_DOWNLOAD_WIDTH = 512;

export function ShareVerification() {
  const [url, setUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const mounted = useMounted();
  const toast = useToast();

  useEffect(() => {
    setUrl(window.location.href);
    setCanShare(typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, verificationQrOptions(QR_DISPLAY_SCALE))
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
      toast.error('Failed to copy link — please copy it manually.');
    }
  }

  async function handleDownloadQr() {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        margin: 2,
        width: QR_DOWNLOAD_WIDTH,
        color: { dark: '#7D00FF', light: '#ffffff' },
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = qrFileName(url);
      link.click();
    } catch (err) {
      console.error('Failed to download QR code: ', err);
      toast.error('Failed to download the QR code.');
    }
  }

  async function handleShare() {
    try {
      await navigator.share({ title: document.title, url });
    } catch (err) {
      // User dismissed the share sheet — nothing to do.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Share failed for another reason: fall back to copying the link.
      await handleCopy();
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
            width={200}
            height={200}
            decoding="async"
            style={{ imageRendering: 'pixelated' }}
            className="rounded"
          />
        ) : (
          <div className="h-[200px] w-[200px] rounded bg-black/5 animate-pulse" />
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
          onClick={canShare ? handleShare : handleCopy}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
            copied
              ? 'bg-emerald-500 text-white'
              : 'bg-will-purple text-white hover:bg-will-purple/90'
          }`}
        >
          {copied ? 'Copied!' : canShare ? 'Share Link' : 'Copy Link'}
        </button>
        {/* Sharing replaces copying on devices with a share sheet; keep a plain copy next to it. */}
        {canShare && !copied ? (
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-will-light/80 transition hover:border-white/40"
          >
            Copy Link
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleDownloadQr}
          disabled={!qrDataUrl}
          className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-will-light/80 transition hover:border-white/40 disabled:opacity-50"
        >
          Download QR
        </button>
      </div>
    </div>
  );
}
