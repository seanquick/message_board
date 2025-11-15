// Backend/Services/mailer.js
const nodemailer = require('nodemailer');

// Email sender
async function sendMail({ to, subject, text, html }) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.FROM_EMAIL || user || 'no-reply@quickclickswebsites.com';

  console.log('[mailer] Preparing to send email…');
  console.log('[mailer] Config auth.user:', user, 'auth.pass defined:', !!pass);
  console.log('[mailer] From:', from, 'To:', to, 'Subject:', subject);
  console.log('[mailer] Module loaded at:', new Date().toISOString());


  if (!user || !pass) {
    const msg = '[mailer] ❌ SMTP_USER or SMTP_PASS is undefined — cannot send email.';
    console.error(msg);
    throw new Error(msg);
  }

  // Create transport inside function to ensure latest env values
  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false, // STARTTLS
    auth: { user, pass },
    tls: { ciphers: 'SSLv3' },
  });

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
