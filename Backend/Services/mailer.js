// Backend/Services/mailer.js
const nodemailer = require('nodemailer');

function makeTransport() {
  // ✅ Preferred: use single SMTP_URL
  if (process.env.SMTP_URL) {
    return nodemailer.createTransport(process.env.SMTP_URL, {
      logger: true,
      debug: true,
    });
  }

  // ✅ Fallback to discrete SMTP values
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true', // true for port 465
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
      logger: true,
      debug: true,
    });
  }

  // 🚨 Fallback: dev mode only — no real mail is sent
  return {
    sendMail: async (opts) => {
      console.warn('[mailer] Using DEV logger — no real email sent.');
      console.log('[mailer] To:', opts.to);
      console.log('[mailer] Subject:', opts.subject);
      console.log('[mailer] Text:', opts.text);
      console.log('[mailer] HTML:', opts.html);
      return { messageId: 'dev-mode-no-send' };
    },
  };
}

const transporter = makeTransport();

/**
 * Sends an email via configured SMTP transporter.
 * @param {Object} opts
 * @param {string} opts.to - Recipient email address
 * @param {string} opts.subject - Email subject line
 * @param {string} [opts.text] - Plain text version
 * @param {string} [opts.html] - HTML version
 */
async function sendMail({ to, subject, text, html }) {
  const from = process.env.FROM_EMAIL || 'no-reply@example.com';

  try {
    const result = await transporter.sendMail({ from, to, subject, text, html });
    console.log(`[mailer] ✅ Sent email to ${to} — Message ID: ${result.messageId}`);
    return result;
  } catch (err) {
    console.error('[mailer] ❌ Failed to send email:', err);
    throw err;
  }
}

module.exports = { sendMail };
