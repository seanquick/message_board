// Backend/Services/mailer.js
const nodemailer = require('nodemailer');

// Set up transport using Microsoft 365 SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false, // Use STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    ciphers: 'SSLv3',
  }
});

// Email sender
async function sendMail({ to, subject, text, html }) {
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
