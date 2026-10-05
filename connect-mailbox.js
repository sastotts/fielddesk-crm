// POST {password}  -> tests the user's IONOS login (sending + receiving) and saves it encrypted.
// DELETE           -> disconnects the user's mailbox.
const nodemailer = require("nodemailer");
const { ImapFlow } = require("imapflow");
const { json, requireUser, db } = require("../lib/auth");
const { encrypt } = require("../lib/crypto");

exports.handler = async (event) => {
  const { user, token, error } = await requireUser(event);
  if (error) return error;

  try {
    if (event.httpMethod === "DELETE") {
      await db(token, `user_mail_accounts?user_id=eq.${user.id}`, { method: "DELETE", prefer: "return=minimal" });
      return json(200, { success: true });
    }
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const { password } = JSON.parse(event.body || "{}");
    if (!password) return json(400, { error: "Please enter your email password" });
    const email = user.email; // mailbox is always the address you log into FieldDesk with

    // 1) Test sending
    const smtp = nodemailer.createTransport({ host: "smtp.ionos.com", port: 587, secure: false, auth: { user: email, pass: password } });
    try { await smtp.verify(); }
    catch (e) { return json(400, { error: "IONOS rejected that password (sending). Double-check it by logging into IONOS webmail." }); }

    // 2) Test receiving
    const imap = new ImapFlow({ host: "imap.ionos.com", port: 993, secure: true, auth: { user: email, pass: password }, logger: false });
    try { await imap.connect(); await imap.logout(); }
    catch (e) { return json(400, { error: "IONOS rejected that password (inbox). Double-check it by logging into IONOS webmail." }); }

    const row = { user_id: user.id, email, enc_password: encrypt(password), verified_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await db(token, "user_mail_accounts?on_conflict=user_id", { method: "POST", body: row, prefer: "resolution=merge-duplicates,return=minimal" });
    return json(200, { success: true, email });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
