/**
 * SMS delivery for two-factor codes (issue #879).
 *
 * Messages go through [Sent](https://sent.dm), a REST messaging API covering
 * SMS (and WhatsApp/RCS) behind one endpoint. The integration is server-only:
 * `SENT_API_KEY` must never be exposed to the browser.
 *
 * Without credentials the function does not pretend to have sent anything. In
 * development it logs the code so the flow can be exercised locally; in
 * production it throws, so a misconfigured deployment fails loudly instead of
 * silently locking users out.
 */

const SENT_API_URL = 'https://api.sent.dm/v1/messages';

export interface SmsDeliveryResult {
  delivered: boolean;
  /** Why delivery did not happen, for logs (never shown to the user verbatim). */
  reason?: 'not-configured' | 'provider-error';
}

export function isSmsConfigured(): boolean {
  return Boolean(process.env.SENT_API_KEY && process.env.SENT_PROJECT_ID);
}

/** Sends `text` to `to` (E.164). Returns whether the provider accepted it. */
export async function sendSms(to: string, text: string): Promise<SmsDeliveryResult> {
  const apiKey = process.env.SENT_API_KEY;
  const projectId = process.env.SENT_PROJECT_ID;

  if (!apiKey || !projectId) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SMS two-factor authentication is not configured: set SENT_API_KEY and SENT_PROJECT_ID.',
      );
    }
    console.info(`[2fa] SMS to ${to} (development, not sent): ${text}`);
    return { delivered: false, reason: 'not-configured' };
  }

  try {
    const response = await fetch(SENT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        to,
        channel: 'sms',
        text,
      }),
    });

    if (!response.ok) {
      console.error(`[2fa] Sent SMS failed (${response.status})`);
      return { delivered: false, reason: 'provider-error' };
    }
    return { delivered: true };
  } catch (error) {
    console.error('[2fa] Sent SMS request failed', error);
    return { delivered: false, reason: 'provider-error' };
  }
}

/** The message a user receives for an SMS second factor. */
export function buildSmsCodeMessage(code: string, minutes = 5): string {
  return `Your SoroWill verification code is ${code}. It expires in ${minutes} minutes. If you did not request it, ignore this message.`;
}
