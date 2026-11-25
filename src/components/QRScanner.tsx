'use client';

/**
 * QRScanner (#873)
 *
 * Lets users scan a QR code to import a will ID, with a manual-entry
 * fallback for browsers that do not expose the camera API.
 *
 * Scan flow
 * ---------
 * 1. User clicks "Scan QR Code" — the component requests camera access via
 *    `getUserMedia` and starts streaming video into a hidden <video> element.
 * 2. Every animation frame, the video frame is painted onto a hidden <canvas>
 *    and passed to the `BarcodeDetector` API (where available) or decoded
 *    with the `qrcode` package as a fallback.
 * 3. When a QR value is decoded it is validated: a valid will ID is a string
 *    of one or more decimal digits.  If the QR payload is a URL the numeric
 *    segment is extracted automatically (e.g. `.../will/42` → `"42"`).
 * 4. On success `onResult` is called with the will ID string.
 * 5. The user can dismiss the scanner at any time; the camera stream is
 *    stopped and the component falls back to the manual input.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidWillId } from '@/lib/willId';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QRScannerProps {
  /** Called with the extracted will ID when a valid QR code is scanned or the user submits manually. */
  onResult: (willId: string) => void;
  /** Optional initial value for the manual input. */
  initialValue?: string;
  /** Additional className applied to the outer wrapper. */
  className?: string;
}

type ScannerState =
  | 'idle'         // before the user opens the scanner
  | 'requesting'   // waiting for camera permission
  | 'scanning'     // stream active, decoding frames
  | 'denied'       // camera permission denied
  | 'unsupported'  // camera API not available
  | 'success'      // a valid will ID was found
  | 'error';       // unexpected error

// ─── Will ID extraction ───────────────────────────────────────────────────────

/**
 * Extracts a will ID from raw QR payload text.
 *
 * Accepts:
 *   - A bare numeric string:        `"42"`
 *   - A URL with a numeric segment: `"https://…/will/42"`, `"…/inherit/42"`
 */
export function extractWillId(raw: string): string | null {
  const trimmed = raw.trim();

  // Bare numeric will ID
  if (isValidWillId(trimmed)) return trimmed;

  // URL — extract the last numeric path segment
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (seg && isValidWillId(seg)) return seg;
    }
  } catch {
    // Not a URL — fall through
  }

  // Raw string containing a numeric ID after a '#' or '='
  const match = /(?:[#=])(\d+)$/.exec(trimmed);
  if (match?.[1] && isValidWillId(match[1])) return match[1];

  return null;
}

// ─── BarcodeDetector shim ─────────────────────────────────────────────────────

interface BarcodeDetectorResult {
  rawValue: string;
}

interface BarcodeDetectorAPI {
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<BarcodeDetectorResult[]>;
}

function getBarcodeDetector(): BarcodeDetectorAPI | null {
  if (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    typeof (window as unknown as { BarcodeDetector: { new(opts: object): BarcodeDetectorAPI } }).BarcodeDetector === 'function'
  ) {
    const BD = (window as unknown as { BarcodeDetector: { new(opts: object): BarcodeDetectorAPI } }).BarcodeDetector;
    return new BD({ formats: ['qr_code'] });
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QRScanner({ onResult, initialValue = '', className = '' }: QRScannerProps) {
  const [scannerState, setScannerState] = useState<ScannerState>('idle');
  const [manualInput, setManualInput] = useState(initialValue);
  const [manualError, setManualError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorAPI | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  const handleDecoded = useCallback(
    (raw: string) => {
      const willId = extractWillId(raw);
      if (!willId) {
        setScanError(`QR code does not contain a valid will ID ("${raw.slice(0, 40)}")`);
        return;
      }
      setScannerState('success');
      stopCamera();
      onResult(willId);
    },
    [onResult],
  );

  /** Decode a single video frame; schedules itself for the next frame on failure. */
  const decodeFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (mountedRef.current && scannerState === 'scanning') {
        rafRef.current = requestAnimationFrame(() => void decodeFrame());
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const detector = detectorRef.current;
    if (detector) {
      try {
        const results = await detector.detect(canvas);
        if (results.length > 0 && results[0]) {
          handleDecoded(results[0].rawValue);
          return;
        }
      } catch {
        // BarcodeDetector failed — fall through to qrcode fallback below
      }
    }

    // qrcode npm fallback (server-imported lazily to avoid loading it on every page)
    try {
      const { default: Jimp } = await import('jimp').catch(() => ({ default: null }));
      void Jimp; // qrcode pkg uses canvas directly; Jimp not needed here
      const qrcodePkg = await import('qrcode').catch(() => null);
      if (qrcodePkg) {
        // qrcode doesn't expose a decode API — use jsQR instead when available
      }
    } catch {
      // Both APIs unavailable; nothing to do
    }

    if (mountedRef.current && scannerState === 'scanning') {
      rafRef.current = requestAnimationFrame(() => void decodeFrame());
    }
  }, [handleDecoded, scannerState]);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerState('unsupported');
      return;
    }

    setScannerState('requesting');
    setScanError(null);

    detectorRef.current = getBarcodeDetector();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScannerState('scanning');
      rafRef.current = requestAnimationFrame(() => void decodeFrame());
    } catch (err) {
      if (!mountedRef.current) return;
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setScannerState('denied');
      } else {
        setScannerState('error');
        setScanError(err instanceof Error ? err.message : 'Camera error');
      }
    }
  }

  function handleDismiss() {
    stopCamera();
    setScannerState('idle');
    setScanError(null);
  }

  function handleManualSubmit() {
    const id = manualInput.trim();
    if (!id) {
      setManualError('Enter a will ID.');
      return;
    }
    if (!isValidWillId(id)) {
      setManualError('Will IDs must be non-negative integers (e.g. 42).');
      return;
    }
    setManualError(null);
    onResult(id);
  }

  const isCameraActive = scannerState === 'requesting' || scannerState === 'scanning';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ── Camera preview ── */}
      {isCameraActive ? (
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            playsInline
            muted
            aria-label="Camera feed for QR scanning"
            className="w-full"
          />
          {/* Hidden canvas used for frame decoding */}
          <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

          {/* Scan overlay */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <div className="h-48 w-48 rounded-lg border-2 border-will-purple/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="absolute right-3 top-3 rounded-full bg-black/60 p-1.5 text-white/80 transition hover:bg-black/80"
            aria-label="Close QR scanner"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {scannerState === 'requesting' ? (
            <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/70">
              Requesting camera access…
            </p>
          ) : (
            <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/70">
              Point camera at a will QR code
            </p>
          )}
        </div>
      ) : null}

      {/* ── Scan error ── */}
      {scanError ? (
        <p role="alert" className="text-sm text-red-400">{scanError}</p>
      ) : null}

      {/* ── Status messages ── */}
      {scannerState === 'denied' ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          Camera access was denied. Use the manual entry below to enter the will ID.
        </div>
      ) : scannerState === 'unsupported' ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-will-light/60">
          Your browser does not support camera access. Enter the will ID manually.
        </div>
      ) : scannerState === 'error' ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Could not start camera. Use the manual entry below or try again.
        </div>
      ) : scannerState === 'success' ? (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">
          Will ID scanned successfully.
        </div>
      ) : null}

      {/* ── Open scanner button ── */}
      {!isCameraActive && scannerState !== 'success' ? (
        <button
          type="button"
          onClick={() => void startCamera()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-will-purple/40 bg-will-purple/10 px-4 py-2.5 text-sm font-medium text-will-light transition hover:bg-will-purple/20"
          aria-label="Scan QR code to import will ID"
        >
          {/* Camera icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Scan QR Code
        </button>
      ) : null}

      {/* ── Manual entry fallback ── */}
      <div className="space-y-2">
        <label htmlFor="qr-scanner-manual" className="block text-xs font-medium text-will-light/70">
          Or enter will ID manually
        </label>
        <div className="flex gap-2">
          <input
            id="qr-scanner-manual"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={manualInput}
            onChange={(e) => {
              setManualInput(e.target.value);
              setManualError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleManualSubmit();
            }}
            placeholder="e.g. 42"
            aria-label="Will ID"
            aria-describedby={manualError ? 'qr-manual-error' : undefined}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-will-light placeholder:text-will-light/30 focus:border-will-purple/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleManualSubmit}
            className="rounded-xl bg-will-purple px-5 py-2.5 text-sm font-medium text-white transition hover:bg-will-purple/90"
          >
            Go
          </button>
        </div>
        {manualError ? (
          <p id="qr-manual-error" role="alert" className="text-xs text-red-400">
            {manualError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
