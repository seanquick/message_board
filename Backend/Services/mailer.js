// Backend/Services/mailer.js
const nodemailer = require('nodemailer');

function makeTransport() {
  // Preferred: SMTP_URL (e.g. smtp://user:pass@smtp.example.com:587)
  if (process.env.SMTP_URL) return nodemailer.createTransport(process.env.SMTP_URL);
  // Fallback discrete envs
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: !!process.env.SMTP_SECURE, // true for 465, false for 587
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  // Dev: console logger
  return {
    sendMail: async (opts) => {
      console.log('[mailer] (DEV LOG ONLY) To:', opts.to, 'Subj:', opts.subject, '\n', opts.text || opts.html);
      return { messageId: 'dev' };
    }
  };
}
const transporter = makeTransport();

async function sendMail({ to, subject, text, html }) {
  const from = process.env.FROM_EMAIL || 'no-reply@example.com';
  try {
    return await transporter.sendMail({ from, to, subject, text, html });
  } catch (e) {
    console.error('[mailer] sendMail error:', e);
  }
}

module.exports = { sendMail };
