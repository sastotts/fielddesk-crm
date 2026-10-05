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

module.exports = { json, requireUser, db };
