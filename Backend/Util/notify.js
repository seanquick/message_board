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
  if (email && email.to && email.subject && email.html) {
    try {
      // Auto‑append unsubscribe footer
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

      // 3️⃣ Send email
      await sendMail({
        to: email.to,
        subject: email.subject,
        html: finalHTML,
        text: finalText
      });

      // 4️⃣ Mark emailSent = true
      await Notification.updateOne(
        { _id: notification._id },
        { $set: { emailSent: true } }
      );

    } catch (err) {
      console.error('[notify] ❌ Email failed — but notification saved:', err);
      // Do NOT throw → users should not see an error when posting a comment
    }
  }
}

module.exports = notifyUser;
