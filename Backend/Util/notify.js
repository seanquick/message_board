// Backend/Utils/notify.js
const Notification = require('../Models/Notification');
const { sendMail } = require('../Services/mailer');


async function notifyUser({ userId, type, title, body, link = '', meta = {}, email }) {
  // Save to DB
  await Notification.create({ userId, type, title, body, link, meta });

  // Optionally send email
  if (email) {
    await sendMail({
      to: email,
      subject: title,
      html: `<p>${body}</p><p><a href="${link}">View</a></p>`
    });
  }
}

module.exports = notifyUser;
