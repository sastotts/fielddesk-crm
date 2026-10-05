// POST {password}  -> tests the user's IONOS login (sending + receiving) and saves it encrypted.
// DELETE           -> disconnects the user's mailbox.
const nodemailer = require("nodemailer");
const { ImapFlow } = require("imapflow");
// ===== Shared helpers (kept in this file so it can be uploaded on its own) =====
// Shared helpers: verify the caller is a logged-in FieldDesk user,
// and talk to Supabase as that user (so database security rules apply).
const SUPABASE_URL = "https://wlomwcwwlqbxosujztxn.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indsb213Y3d3bHFieG9zdWp6dHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjgyNjAsImV4cCI6MjA5ODQwNDI2MH0.wBVlo_NZIAedZpaeIAlg7CtbRVnPEd7lIOUrNTjyRaw";

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

async function requireUser(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: json(401, { error: "Not logged in" }) };
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return { error: json(401, { error: "Session expired - please log in again" }) };
  const user = await r.json();
  return { user, token };
}

// Minimal REST call to Supabase acting as the logged-in user
async function db(token, path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method || "GET",
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error((data && (data.message || data.error)) || `Database error ${r.status}`);
  return data;
}


// AES-256-GCM encryption for stored mailbox passwords.
// The key lives only in Netlify (MAIL_ENC_KEY), never in the database or browser.
const crypto = require("crypto");

function key() {
  const k = process.env.MAIL_ENC_KEY;
  if (!k || k.length < 20) throw new Error("Server not set up: MAIL_ENC_KEY is missing in Netlify");
  return crypto.createHash("sha256").update(k).digest();
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

function decrypt(stored) {
  const [iv, tag, data] = String(stored).split(":");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}


// Load the logged-in user's own mailbox login (decrypted, server-side only).

async function getMailbox(token, userId) {
  const rows = await db(token, `user_mail_accounts?user_id=eq.${userId}&select=email,enc_password,imap_host,smtp_host`);
  if (!rows || !rows.length) return null;
  const r = rows[0];
  return { email: r.email, password: decrypt(r.enc_password), imapHost: r.imap_host, smtpHost: r.smtp_host };
}

// ===== End helpers =====


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
