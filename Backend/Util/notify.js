// Backend/Utils/notify.js
const Notification = require('../Models/Notification');
const { sendMail } = require('../Services/mailer');

async function notifyUser({ userId, type, title, body, link = '', meta = {}, email }) {
  // Save to DB
  await Notification.create({ userId, type, title, body, link, meta });

  // Optionally send email
  if (email && email.to && email.subject && email.html) {
    await sendMail({
      to: email.to,
      subject: email.subject,
      html: email.html
    });
  }
}

module.exports = notifyUser;
