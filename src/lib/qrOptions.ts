import type { QRCodeToDataURLOptions } from 'qrcode';

/**
 * Settings for the verification QR code, chosen so it still scans from a screenshot, a
 * compressed chat image or a printout (#832):
 *
 * - Error correction level H recovers up to about 30% of the code, which absorbs JPEG artefacts and
 *   scaling blur.
 * - A quiet zone of 4 modules, the width the QR specification asks for. Readers lose the code when
 *   it is cropped tighter.
 * - Black modules on white, the highest contrast there is (21:1). Coloured modules measure
 *   lower in the greyscale step many readers start with.
 * - A whole number of pixels per module (`scale`) so edges stay sharp. The image is shown with
 *   `image-rendering: pixelated` so a screenshot of it is not smoothed either.
 */
export const QR_ERROR_CORRECTION = 'H';
export const QR_QUIET_ZONE_MODULES = 4;
export const QR_DARK_COLOR = '#000000';
export const QR_LIGHT_COLOR = '#ffffff';

/** Pixels per module for the image on screen, and for the downloaded file. */
export const QR_DISPLAY_SCALE = 8;
export const QR_DOWNLOAD_SCALE = 16;

export function verificationQrOptions(scale: number): QRCodeToDataURLOptions {
  return {
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: QR_QUIET_ZONE_MODULES,
    scale,
    color: { dark: QR_DARK_COLOR, light: QR_LIGHT_COLOR },
  };
}
