import { NextResponse } from "next/server";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@example.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ContactPayload {
  name?: unknown;
  email?: unknown;
  message?: unknown;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let payload: ContactPayload;

  try {
    payload = (await request.json()) as ContactPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const name = asTrimmedString(payload.name);
  const email = asTrimmedString(payload.email);
  const message = asTrimmedString(payload.message);

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name is required.";
  if (!email) {
    errors.email = "Email is required.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Please enter a valid email address.";
  }
  if (!message) errors.message = "Message is required.";

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  // Deliver the submission to the support inbox. When a mail provider is
  // configured (e.g. RESEND_API_KEY), forward the message there; otherwise
  // log it so the submission is not silently lost.
  const apiKey = process.env.RESEND_API_KEY;

  if (apiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.SUPPORT_FROM_EMAIL ?? "onboarding@resend.dev",
          to: SUPPORT_EMAIL,
          reply_to: email,
          subject: `Contact form submission from ${name}`,
          text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
        }),
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: "Unable to send your message. Please try again later." },
          { status: 502 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Unable to send your message. Please try again later." },
        { status: 502 }
      );
    }
  } else {
    console.info("[contact] support message received", {
      to: SUPPORT_EMAIL,
      name,
      email,
      message,
    });
  }

  return NextResponse.json({ ok: true });
}
