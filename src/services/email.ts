import nodemailer from 'nodemailer';
import { config } from '../config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Transport factory (lazy — only created when sending)
// ─────────────────────────────────────────────────────────────────────────────

function createTransport() {
  if (!config.smtpHost) {
    throw new Error(
      'SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in environment.',
    );
  }
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort ?? 587,
    secure: (config.smtpPort ?? 587) === 465,
    auth:
      config.smtpUser
        ? { user: config.smtpUser, pass: config.smtpPass ?? '' }
        : undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Invite email
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send the initial account-setup invitation email.
 *
 * SECURITY: `inviteToken` must NOT be logged or stored anywhere after this
 * function returns. It appears only in this email and in the C++ response
 * that triggered user creation.
 */
export async function sendInviteEmail(to: string, inviteToken: string): Promise<void> {
  const transport = createTransport();
  const setupUrl = `${config.frontendUrl}/setup?token=${inviteToken}`;

  await transport.sendMail({
    from: config.smtpFrom,
    to,
    subject: 'Your taiga Platform Invitation',

    // ── Plain-text fallback ──────────────────────────────────────────────────
    text: [
      'You have been invited to the taiga Risk Management Platform.',
      '',
      'To activate your account, visit the link below within 24 hours:',
      setupUrl,
      '',
      'This link is single-use and expires after 24 hours.',
      'Do not share it with anyone.',
    ].join('\n'),

    // ── HTML version ─────────────────────────────────────────────────────────
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>taiga Invitation</title>
</head>
<body style="margin:0;padding:0;background:#1a191c;font-family:'IBM Plex Mono',monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a191c;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#242226;border:1px solid #3a3840;border-radius:6px;padding:40px;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:11px;letter-spacing:2px;color:#808080;text-transform:uppercase;">
                taiga Platform
              </p>
              <h1 style="margin:0 0 24px;font-size:22px;color:#ffffff;font-weight:600;">
                Account Invitation
              </h1>
              <p style="margin:0 0 16px;font-size:14px;color:#ccc;line-height:1.7;">
                You have been invited to access the taiga risk management platform.
              </p>
              <p style="margin:0 0 32px;font-size:14px;color:#ccc;line-height:1.7;">
                Click the button below to set your password and configure two-factor
                authentication. The link expires in <strong style="color:#fff;">24 hours</strong>
                and can only be used once.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="border-radius:4px;background:#2d6a4f;">
                    <a href="${setupUrl}"
                       style="display:inline-block;padding:12px 28px;font-family:'IBM Plex Mono',monospace;
                              font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;
                              border-radius:4px;letter-spacing:0.5px;">
                      Set Up Your Account →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:12px;color:#606060;line-height:1.6;">
                If the button does not work, copy this URL into your browser:
              </p>
              <p style="margin:0 0 32px;font-size:11px;color:#808080;word-break:break-all;">
                ${setupUrl}
              </p>

              <hr style="border:none;border-top:1px solid #3a3840;margin:0 0 24px;" />

              <p style="margin:0;font-size:11px;color:#505050;line-height:1.6;">
                If you did not expect this invitation, please ignore this email.
                Do not share this link with anyone — it grants full access to set up an account.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Password reset email
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a password reset email.
 *
 * SECURITY: `resetToken` must NOT be logged or stored anywhere after this
 * function returns. Token expires after 1 hour and is single-use.
 */
export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  const transport = createTransport();
  const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;

  await transport.sendMail({
    from: config.smtpFrom,
    to,
    subject: 'Taiga Platform — Password Reset',

    text: [
      'A password reset was requested for your Taiga account.',
      '',
      'To reset your password, visit the link below within 1 hour:',
      resetUrl,
      '',
      'This link is single-use and expires after 1 hour.',
      'If you did not request a password reset, ignore this email.',
    ].join('\n'),

    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Taiga Password Reset</title>
</head>
<body style="margin:0;padding:0;background:#1a191c;font-family:'IBM Plex Mono',monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a191c;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#242226;border:1px solid #3a3840;border-radius:6px;padding:40px;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:11px;letter-spacing:2px;color:#808080;text-transform:uppercase;">
                Taiga Platform
              </p>
              <h1 style="margin:0 0 24px;font-size:22px;color:#ffffff;font-weight:600;">
                Password Reset
              </h1>
              <p style="margin:0 0 16px;font-size:14px;color:#ccc;line-height:1.7;">
                A password reset was requested for your account.
              </p>
              <p style="margin:0 0 32px;font-size:14px;color:#ccc;line-height:1.7;">
                Click the button below to set a new password. The link expires in
                <strong style="color:#fff;">1 hour</strong> and can only be used once.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="border-radius:4px;background:#49b3b3;">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:12px 28px;font-family:'IBM Plex Mono',monospace;
                              font-size:14px;font-weight:600;color:#131214;text-decoration:none;
                              border-radius:4px;letter-spacing:0.5px;">
                      Reset Password →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:12px;color:#606060;line-height:1.6;">
                If the button does not work, copy this URL into your browser:
              </p>
              <p style="margin:0 0 32px;font-size:11px;color:#808080;word-break:break-all;">
                ${resetUrl}
              </p>

              <hr style="border:none;border-top:1px solid #3a3840;margin:0 0 24px;" />

              <p style="margin:0;font-size:11px;color:#505050;line-height:1.6;">
                If you did not request a password reset, ignore this email.
                Your password will not be changed unless you click the link above.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });
}