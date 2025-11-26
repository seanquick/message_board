// Backend/Utils/notify.js

// ---- HTML → Plain Text fallback helper ----
function stripHTML(html) {
  return html.replace(/<\/?[^>]+(>|$)/g, '').replace(/\s+/g, ' ').trim();
}

const Notification = require('../Models/Notification');
const { sendMail } = require('../Services/mailer');

async function notifyUser({ userId, type, title, body, link = '', meta = {}, email }) {
  // 1️⃣ Save the notification to the database first
  const notification = await Notification.create({
    userId,
    type,
    title,
    body,
    link,
    meta,
    emailSent: false // default → will be updated only if sendMail succeeds
  });

  // 2️⃣ Handle optional email
  if (email && email.to?.trim() && email.subject && email.html) {
    const recipientEmail = email.to.trim();

    try {
      const footer = `
        <hr>
        <p style="font-size: 12px; color: #777;">
          Don’t want these emails?
          <a href="https://board.quickclickswebsites.com/settings.html#notifications">Manage your preferences</a>.
        </p>
      `;

      const finalHTML = `${email.html}${footer}`;
      const finalText = email.text || stripHTML(email.html) +
        `\n\nManage your email preferences at: https://board.quickclickswebsites.com/settings.html#notifications`;

      await sendMail({
        to: recipientEmail,
        subject: email.subject,
        html: finalHTML,
        text: finalText
      });

      await Notification.updateOne(
        { _id: notification._id },
        { $set: { emailSent: true } }
      );
    } catch (err) {
      console.error('[notify] ❌ Email failed — but notification saved:', err);
    }
  } else {
    console.warn('[notify] ⚠️ Email not sent: invalid email fields', {
      to: email?.to,
      subject: email?.subject,
      htmlPresent: !!email?.html
    });
  }

}

module.exports = notifyUser;
