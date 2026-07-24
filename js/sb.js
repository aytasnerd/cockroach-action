// A very small Supabase client, written against the raw REST API.
//
// Why not the official SDK: this site has no build step and must keep working
// with zero signal. Pulling supabase-js from a CDN would add a blocking
// network dependency to first paint and a script the service worker cannot
// cache reliably. Everything used here is two stable HTTP APIs (GoTrue for
// auth, PostgREST for data), so a hundred lines of fetch() is the whole job.

var CASupabase = (function () {
  var cfg = window.CA_CONFIG || {};
  var SESSION_KEY = "ca_session";

  function configured() {
    return !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY);
  }

  function authUrl(path) { return cfg.SUPABASE_URL + "/auth/v1" + path; }
  function restUrl(path) { return cfg.SUPABASE_URL + "/rest/v1" + path; }

  // ---------------------------------------------------------------- session

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch (e) { return null; }
  }

  function writeSession(s) {
    if (!s || !s.access_token) { localStorage.removeItem(SESSION_KEY); return null; }
    // expires_at from GoTrue is absolute unix seconds; recompute defensively
    // because a device with a wrong clock is common in the field.
    s.expires_at = Math.floor(Date.now() / 1000) + (s.expires_in || 3600);
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    return s;
  }

  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function expired(s) {
    if (!s || !s.expires_at) return true;
    return Math.floor(Date.now() / 1000) > s.expires_at - 60; // refresh a minute early
  }

  // ---------------------------------------------------------------- fetch

  async function authFetch(path, body, opts) {
    opts = opts || {};
    var headers = { "apikey": cfg.SUPABASE_KEY, "Content-Type": "application/json" };
    if (opts.token) headers["Authorization"] = "Bearer " + opts.token;
    var res = await fetch(authUrl(path), {
      method: opts.method || "POST",
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    var json = null;
    try { json = await res.json(); } catch (e) { /* 204s and empty bodies */ }
    if (!res.ok) {
      var err = new Error((json && (json.msg || json.message || json.error_description)) || ("auth " + res.status));
      err.status = res.status;
      err.code = json && (json.error_code || json.code);
      throw err;
    }
    return json;
  }

  var refreshing = null; // collapse concurrent refreshes; GoTrue rotates tokens

  async function refresh(s) {
    if (refreshing) return refreshing;
    refreshing = (async function () {
      try {
        var next = await authFetch("/token?grant_type=refresh_token", { refresh_token: s.refresh_token });
        return writeSession(next);
      } catch (e) {
        // Refresh token revoked or expired. Drop it and start over as a new
        // anonymous voter rather than leaving the app in a broken state.
        clearSession();
        return null;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  // Returns a usable session, creating an anonymous one if needed.
  async function session(opts) {
    opts = opts || {};
    if (!configured()) return null;
    var s = readSession();

    if (s && expired(s) && s.refresh_token) s = await refresh(s);
    if (s && !expired(s)) return s;
    if (opts.createIfMissing === false) return null;
    if (!navigator.onLine) return null;

    try {
      // Anonymous sign-in: POST /signup with neither email nor phone.
      // Requires "Allow anonymous sign-ins" to be enabled in the dashboard.
      var fresh = await authFetch("/signup", {});
      return writeSession(fresh);
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------- data

  async function request(path, opts) {
    opts = opts || {};
    if (!configured()) throw new Error("supabase not configured");

    var s = opts.anonymous ? null : await session();
    var headers = { "apikey": cfg.SUPABASE_KEY, "Content-Type": "application/json" };
    if (s) headers["Authorization"] = "Bearer " + s.access_token;
    if (opts.prefer) headers["Prefer"] = opts.prefer;

    var res = await fetch(restUrl(path), {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

    var json = null;
    try { json = await res.json(); } catch (e) { /* empty body */ }

    if (!res.ok) {
      var err = new Error((json && (json.message || json.hint)) || ("http " + res.status));
      err.status = res.status;
      err.code = json && json.code;
      // 401 usually means our stored token went stale in a way refresh missed.
      if (res.status === 401) clearSession();
      throw err;
    }
    return json;
  }

  function rpc(fn, args) {
    return request("/rpc/" + fn, { method: "POST", body: args || {} });
  }

  function select(table, query) {
    return request("/" + table + (query ? "?" + query : ""));
  }

  // ---------------------------------------------------------------- moderators

  // Email code sign-in. create_user:false means a typo cannot mint an account.
  function sendLoginCode(email) {
    return authFetch("/otp", { email: email, create_user: false });
  }

  async function verifyLoginCode(email, token) {
    var s = await authFetch("/verify", { type: "email", email: email, token: token });
    return writeSession(s);
  }

  async function currentUser() {
    var s = readSession();
    if (!s) return null;
    if (expired(s) && s.refresh_token) s = await refresh(s);
    return s ? s.user : null;
  }

  function signOut() { clearSession(); }

  return {
    configured: configured,
    session: session,
    currentUser: currentUser,
    signOut: signOut,
    rpc: rpc,
    select: select,
    request: request,
    sendLoginCode: sendLoginCode,
    verifyLoginCode: verifyLoginCode,
  };
})();
