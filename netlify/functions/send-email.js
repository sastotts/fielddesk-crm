const nodemailer = require("nodemailer");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  try {
    const { to, toName, subject, text } = JSON.parse(event.body);
    const transporter = nodemailer.createTransport({
      host: "smtp.ionos.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.IONOS_EMAIL,
        pass: process.env.IONOS_PASSWORD,
      },
    });
    await transporter.sendMail({
      from: `"S&S Contracting Company LLC" <${process.env.IONOS_EMAIL}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      bcc: process.env.IONOS_EMAIL,
      replyTo: process.env.IONOS_EMAIL,
      subject,
      text,
    });
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
