import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP mail sending, provider-agnostic — any host that speaks SMTP works (Brevo, Gmail,
 * Resend, Mailgun…). Configure SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS; see
 * server/.env.example for free-tier setups.
 *
 * When SMTP is not configured the app keeps working: reset links are logged to the server
 * console instead, which is the intended local-development behaviour.
 */

// undefined = not built yet, null = deliberately disabled (no SMTP config).
let cached: Transporter | null | undefined;

export function isMailerConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

function getTransport(): Transporter | null {
  if (cached !== undefined) return cached;

  if (!isMailerConfigured()) {
    cached = null;
    return null;
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    // 465 is implicit TLS; 587 and 2525 start plaintext and upgrade via STARTTLS.
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!.trim(),
    },
  });
  return cached;
}

/** Envelope sender. Must be an address the SMTP provider has authorised. */
function fromAddress(): string {
  const explicit = process.env.MAIL_FROM?.trim();
  if (explicit) return explicit;
  const user = process.env.SMTP_USER?.trim() ?? "";
  return user ? `ResumeAI <${user}>` : "ResumeAI";
}

function resetEmailHtml(resetUrl: string): string {
  // Inline styles only — mail clients strip <style> blocks.
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2330">
  <h2 style="margin:0 0 16px;font-size:20px">Reset your ResumeAI password</h2>
  <p style="margin:0 0 20px;line-height:1.6">
    We received a request to reset your password. Click the button below to choose a new one.
    This link expires in 1 hour.
  </p>
  <p style="margin:0 0 24px">
    <a href="${resetUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Reset password</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or paste this link into your browser:</p>
  <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${resetUrl}" style="color:#6366f1">${resetUrl}</a></p>
  <p style="margin:0;font-size:13px;color:#6b7280">
    If you didn't request this, you can ignore this email — your password stays unchanged.
  </p>
</div>`;
}

/**
 * Send the reset link. Returns true when SMTP accepted the message.
 *
 * Never throws: a mail outage must not turn POST /api/auth/forgot-password into a 500, since
 * differing responses would reveal which addresses have accounts.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<boolean> {
  const transport = getTransport();

  if (!transport) {
    console.warn(
      "[resumeAI] SMTP is not configured — no email sent. Set SMTP_HOST/SMTP_USER/SMTP_PASS " +
        "(see server/.env.example). Reset link for local testing:"
    );
    console.log(`[PASSWORD RESET LINK]: ${resetUrl}`);
    return false;
  }

  try {
    const info = await transport.sendMail({
      from: fromAddress(),
      to,
      subject: "Reset your ResumeAI password",
      text:
        "Reset your ResumeAI password using this link (expires in 1 hour):\n\n" +
        `${resetUrl}\n\n` +
        "If you didn't request this, you can ignore this email.",
      html: resetEmailHtml(resetUrl),
    });
    // Log the message id, never the link — production logs should not carry a working token.
    console.info("[resumeAI] password reset email sent (id: %s)", info.messageId);
    return true;
  } catch (err) {
    console.error("[resumeAI] Failed to send password reset email:", err);
    return false;
  }
}

/** Startup probe: confirms the SMTP credentials actually authenticate. */
export async function verifyMailer(): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      "[resumeAI] SMTP not configured — password reset links will be logged, not emailed."
    );
    return;
  }
  try {
    await transport.verify();
    console.log("[resumeAI] SMTP ready (%s)", process.env.SMTP_HOST?.trim());
  } catch (err) {
    console.error(
      "[resumeAI] SMTP configured but the connection failed — reset emails will not send:",
      err instanceof Error ? err.message : err
    );
  }
}
