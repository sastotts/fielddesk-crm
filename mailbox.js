// Load the logged-in user's own mailbox login (decrypted, server-side only).
const { db } = require("./auth");
const { decrypt } = require("./crypto");

async function getMailbox(token, userId) {
  const rows = await db(token, `user_mail_accounts?user_id=eq.${userId}&select=email,enc_password,imap_host,smtp_host`);
  if (!rows || !rows.length) return null;
  const r = rows[0];
  return { email: r.email, password: decrypt(r.enc_password), imapHost: r.imap_host, smtpHost: r.smtp_host };
}

module.exports = { getMailbox };
