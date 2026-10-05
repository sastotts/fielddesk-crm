// Sends email as the logged-in user from their own IONOS mailbox.
// Body: { to, toName, cc, subject, text, html, inReplyTo, references, attachments:[{filename, content(base64), contentType}], contactId }
const nodemailer = require("nodemailer");
const MailComposer = require("nodemailer/lib/mail-composer");
const { ImapFlow } = require("imapflow");
const { json, requireUser, db } = require("../lib/auth");
const { getMailbox } = require("../lib/mailbox");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const { user, token, error } = await requireUser(event);
  if (error) return error;

  try {
    const p = JSON.parse(event.body || "{}");
    if (!p.to) return json(400, { error: "No recipient email address" });
    if (!p.subject) return json(400, { error: "Subject is required" });

    const mbox = await getMailbox(token, user.id);
    if (!mbox) return json(400, { error: "Connect your mailbox first: open the Email tab and enter your email password.", code: "NO_MAILBOX" });

    // Display name from FieldDesk profile
    let fromName = "S&S Contracting Company LLC";
    try {
      const u = await db(token, `users?id=eq.${user.id}&select=full_name`);
      if (u && u[0] && u[0].full_name) fromName = `${u[0].full_name} | S&S Contracting`;
    } catch (e) {}

    const transporter = nodemailer.createTransport({
      host: mbox.smtpHost, port: 587, secure: false,
      auth: { user: mbox.email, pass: mbox.password },
    });

    const mail = {
      from: `"${fromName}" <${mbox.email}>`,
      to: p.toName ? `"${String(p.toName).replace(/"/g, "")}" <${p.to}>` : p.to,
      cc: p.cc || undefined,
      replyTo: mbox.email,
      subject: p.subject,
      text: p.text || undefined,
      html: p.html || undefined,
      inReplyTo: p.inReplyTo || undefined,
      references: p.references || p.inReplyTo || undefined,
      attachments: (p.attachments || []).map(a => ({ filename: a.filename, content: a.content, encoding: "base64", contentType: a.contentType })),
    };
    const info = await transporter.sendMail(mail);

    // IONOS doesn't keep a copy of mail sent this way, so put one in the user's Sent folder.
    try {
      const raw = await new MailComposer({ ...mail, messageId: info.messageId }).compile().build();
      const imap = new ImapFlow({ host: mbox.imapHost, port: 993, secure: true, auth: { user: mbox.email, pass: mbox.password }, logger: false });
      await imap.connect();
      const boxes = await imap.list();
      const sent = boxes.find(b => b.specialUse === "\\Sent") || boxes.find(b => /^(sent|sent items|gesendete objekte)$/i.test(b.name));
      if (sent) await imap.append(sent.path, raw, ["\\Seen"]);
      await imap.logout();
    } catch (e) { console.error("Sent-folder copy failed:", e.message); }

    return json(200, { success: true, messageId: info.messageId, from: mbox.email });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
