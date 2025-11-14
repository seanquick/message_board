// test-mail.js
require('dotenv').config();
const { sendMail } = require('./Backend/Services/mailer');

async function runTest() {
  const to = process.env.TEST_EMAIL;
  if (!to) {
    console.error('❌ Missing TEST_EMAIL in .env file');
    process.exit(1);
  }

  try {
    const result = await sendMail({
      to,
      subject: '✅ Test Email from Node App',
      text: 'This is a plain-text test email sent from your Node.js backend.',
      html: `<p>This is a <strong>test email</strong> sent from your Node.js backend.</p>`,
    });

    console.log('✅ Test email sent. Message ID:', result.messageId);
  } catch (err) {
    console.error('❌ Failed to send test email:', err.message);
  }
}

runTest();
