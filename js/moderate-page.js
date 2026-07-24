(function () {
  var el = function (id) { return document.getElementById(id); };
  var pendingEmail = "";

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  }

  function notice(msg, isError) {
    var n = el("notice");
    if (!msg) { n.hidden = true; return; }
    n.textContent = msg;
    n.classList.toggle("error", !!isError);
    n.hidden = false;
  }

  function show(step) {
    el("email-form").hidden = step !== "email";
    el("code-form").hidden = step !== "code";
    el("queue-section").hidden = step !== "queue";
  }

  // ------------------------------------------------------------ sign in

  async function sendCode(e) {
    e.preventDefault();
    var email = el("mod-email").value.trim();
    if (!email) return;
    el("send-code").disabled = true;
    notice(null);
    try {
      await CASupabase.sendLoginCode(email);
      pendingEmail = email;
      show("code");
      el("mod-code").focus();
      notice("If that address is an organizer, a code is on its way.");
    } catch (err) {
      notice(/rate/i.test(err.message || "")
        ? "Too many attempts. Wait a minute and try again."
        : "Couldn't send the code. " + (err.message || ""), true);
    } finally {
      el("send-code").disabled = false;
    }
  }

  async function verifyCode(e) {
    e.preventDefault();
    var code = el("mod-code").value.trim();
    if (!code) return;
    el("verify-code").disabled = true;
    try {
      await CASupabase.verifyLoginCode(pendingEmail, code);
      notice(null);
      await enterQueue();
    } catch (err) {
      notice(/expired/i.test(err.message || "")
        ? "That code has expired. Ask for a new one."
        : "That code didn't work. Check it and try again.", true);
    } finally {
      el("verify-code").disabled = false;
    }
  }

  // ------------------------------------------------------------ queue

  function itemHtml(d, decided) {
    var when = d.created_at ? new Date(d.created_at).toISOString().slice(0, 10) : "";
    var actions = decided
      ? '<span class="tag">' + esc(d.status) + '</span>'
      : '<div class="queue-actions">' +
          '<button class="btn btn-primary" data-accept="' + esc(d.id) + '">Publish</button>' +
          '<button class="btn" data-reject="' + esc(d.id) + '">Reject</button>' +
        '</div>';
    return '<article class="queue-item">' +
      '<h3>' + esc(d.title) + '</h3>' +
      '<div class="body">' + esc(d.body) + '</div>' +
      '<div class="demand-meta" style="margin-bottom:10px;"><span class="tag">' + esc(when) + '</span></div>' +
      actions +
    '</article>';
  }

  async function loadQueue() {
    try {
      var pending = await CASupabase.select(
        "demands",
        "select=id,title,body,status,created_at&status=eq.proposed&order=created_at.asc"
      );
      el("queue").innerHTML = (pending && pending.length)
        ? pending.map(function (d) { return itemHtml(d, false); }).join("")
        : '<div class="empty">Nothing waiting. The queue is clear.</div>';

      var recent = await CASupabase.select(
        "demands",
        "select=id,title,body,status,created_at&status=in.(accepted,rejected)&order=decided_at.desc&limit=8"
      );
      el("recent").innerHTML = (recent && recent.length)
        ? recent.map(function (d) { return itemHtml(d, true); }).join("")
        : '<div class="empty">No decisions yet.</div>';
    } catch (err) {
      notice("Couldn't load the queue. " + (err.message || ""), true);
    }
  }

  async function decide(id, status, btn) {
    btn.disabled = true;
    try {
      await CASupabase.rpc("moderate_demand", { p_demand: id, p_status: status });
      notice(status === "accepted" ? "Published to the list." : "Rejected.");
      await loadQueue();
    } catch (err) {
      notice(/moderator/i.test(err.message || "")
        ? "This account isn't an organizer yet. Ask an admin to add it."
        : "Couldn't save that decision. " + (err.message || ""), true);
      btn.disabled = false;
    }
  }

  async function enterQueue() {
    var user = await CASupabase.currentUser();
    if (!user) { show("email"); return; }
    el("who").textContent = user.email || "signed in";
    show("queue");
    await loadQueue();
  }

  // ------------------------------------------------------------ boot

  document.addEventListener("DOMContentLoaded", async function () {
    if (!CASupabase.configured()) {
      notice("No database configured yet. Fill in js/config.js first.", true);
      show("email");
      el("send-code").disabled = true;
      return;
    }

    el("email-form").addEventListener("submit", sendCode);
    el("code-form").addEventListener("submit", verifyCode);
    el("back-to-email").addEventListener("click", function () { show("email"); notice(null); });
    el("sign-out").addEventListener("click", function () {
      CASupabase.signOut();
      show("email");
      notice("Signed out.");
    });

    document.addEventListener("click", function (e) {
      var a = e.target.closest("[data-accept]");
      var r = e.target.closest("[data-reject]");
      if (a) decide(a.getAttribute("data-accept"), "accepted", a);
      if (r) decide(r.getAttribute("data-reject"), "rejected", r);
    });

    var user = await CASupabase.currentUser();
    // An anonymous session from browsing the public site is not a sign-in.
    if (user && user.email) await enterQueue();
    else show("email");
  });
})();
