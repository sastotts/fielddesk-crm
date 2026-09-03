const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { to, toName, subject, text, html, bcc } = JSON.parse(event.body);

    const transporter = nodemailer.createTransport({
      host: 'smtp.ionos.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.IONOS_EMAIL,
        pass: process.env.IONOS_PASSWORD,
      },
      tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
      from: `"S&S Contracting Company LLC" <${process.env.IONOS_EMAIL}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      subject,
      text,
      html: html || text,
      bcc: bcc || process.env.IONOS_EMAIL,
      replyTo: process.env.IONOS_EMAIL,
    };

    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('Email error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

