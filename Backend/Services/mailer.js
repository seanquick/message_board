// Backend/Services/mailer.js
const nodemailer = require('nodemailer');

// 🔔 Module‑load log
console.log('[mailer] Module loaded at:', new Date().toISOString());

// Prepare auth vars
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
console.log('[mailer] Config on load — SMTP_USER:', SMTP_USER, '| SMTP_PASS set:', !!SMTP_PASS);

async function sendMail({ to, subject, text, html }) {
  // Log at send time
  console.log('[mailer] sendMail invoked at:', new Date().toISOString());
  console.log('[mailer] sendMail payload → to:', to, ', subject:', subject);
  console.log('[mailer] sendMail env vars → SMTP_USER:', process.env.SMTP_USER, '| SMTP_PASS set:', !!process.env.SMTP_PASS);

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    const errMsg = '[mailer] ❌ SMTP credentials missing at send time.';
    console.error(errMsg);
    throw new Error(errMsg);
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      ciphers: 'SSLv3',
    },
  });

  const from = process.env.FROM_EMAIL || process.env.SMTP_USER || 'no-reply@quickclickswebsites.com';

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    console.log(`[mailer] ✅ Sent email to ${to} — Message ID: ${info.messageId}, envelope:`, info.envelope);
    return info;
  } catch (err) {
    console.error('[mailer] ❌ Failed to send email:', err);
    throw err;
  }
}

module.exports = { sendMail };
