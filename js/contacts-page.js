(function () {
  var MPS = [];
  var OFFICES = [];
  var msgEl, qEl, resultsEl, countEl, seedEl;
  var MAX_SHOWN = 40;

  function el(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

  // ---- message draft --------------------------------------------------

  var GENERAL_DRAFT =
    "To your office,\n\n" +
    "I am writing as a member of the public. I am asking your office to act on the exam-leak crisis and to tell me what steps are being taken. Please treat this as a formal request for a response.\n\n" +
    "[Your name - optional]\n" +
    "[Your city - optional]\n" +
    "[A phone or email to reach you - optional]";

  function currentMessage() { return msgEl.value; }

  function seededDemand() {
    var id = seedEl && seedEl.value;
    if (!id) return undefined;
    return (CAStore.getDemands() || []).find(function (d) { return d.id === id; });
  }

  function seedMessage() {
    var id = seedEl.value;
    if (!id) { msgEl.value = GENERAL_DRAFT; return; }
    var d = (CAStore.getDemands() || []).find(function (x) { return x.id === id; });
    msgEl.value = d ? CAActions.draftFor(d, null) : GENERAL_DRAFT;
  }

  function personalise(toName) {
    // Swap the leading "To ..." line for this specific recipient, keep the
    // sender's edits to the rest of the body.
    var body = currentMessage().replace(/^To [^\n]*,\n\n/, "");
    return "To " + toName + ",\n\n" + body;
  }

  // ---- send links -----------------------------------------------------

  var IC = {
    wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20.5l1.8-5.2A8.5 8.5 0 1 1 21 11.5Z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 2 6a2 2 0 0 1 2-2Z"/></svg>',
  };

  function channels(name, opts) {
    var out = [];
    var subject = "A request from a member of the public";
    if (opts.wa) {
      out.push('<a class="channel-btn wa" data-send="wa" data-to="' + esc(name) + '" data-num="' + esc(opts.wa) + '" href="#" target="_blank" rel="noopener">' + IC.wa + 'WhatsApp</a>');
    }
    if (opts.email) {
      out.push('<a class="channel-btn" data-send="mail" data-to="' + esc(name) + '" data-email="' + esc(opts.email) + '" data-subject="' + esc(subject) + '" href="#">' + IC.mail + 'Email</a>');
    }
    if (opts.tel) {
      out.push('<a class="channel-btn" href="tel:' + esc(opts.tel.replace(/[^\d+]/g, "")) + '">' + IC.phone + esc(opts.tel) + '</a>');
    }
    out.push('<button class="channel-btn" data-send="copy" data-to="' + esc(name) + '">' + IC.copy + 'Copy</button>');
    return '<div class="channel-row">' + out.join("") + '</div>';
  }

  // ---- MP results -----------------------------------------------------

  function score(mp, q) {
    var hay = (mp.name + " " + mp.state + " " + mp.seat + " " + mp.party).toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function mpHtml(mp) {
    var em = mp.emails && mp.emails[0];
    var wa = mp.wa && mp.wa[0];
    var tel = (!wa && mp.phones && mp.phones[0]) ? mp.phones[0] : null;
    var who = [mp.seat, mp.state].filter(Boolean).join(" · ");
    return '<div class="finder-result">' +
      '<h3>' + esc(mp.name) + '<span class="pill">' + esc(mp.house) + '</span></h3>' +
      '<div class="who">' + esc(who) + (mp.party ? ' · <span class="party">' + esc(mp.party) + '</span>' : "") + '</div>' +
      channels(mp.name, { wa: wa, email: em, tel: tel }) +
    '</div>';
  }

  function renderResults() {
    var q = qEl.value.trim().toLowerCase();
    if (q.length < 2) {
      resultsEl.innerHTML = "";
      countEl.textContent = MPS.length.toLocaleString() + " MPs on file. Type a name or a state to begin.";
      return;
    }
    var hits = MPS.filter(function (m) { return score(m, q); });
    countEl.textContent = hits.length
      ? hits.length.toLocaleString() + " match" + (hits.length === 1 ? "" : "es") + (hits.length > MAX_SHOWN ? ", showing first " + MAX_SHOWN : "")
      : "No MP matches that. Try a state, or part of the name.";
    resultsEl.innerHTML = hits.slice(0, MAX_SHOWN).map(mpHtml).join("");
  }

  // ---- national offices ----------------------------------------------

  function officeHtml(c) {
    var wa = null; // offices are landlines; no WhatsApp
    var bits = [];
    if (c.role) bits.push('<div class="who">' + esc(c.role) + '</div>');
    var meta = [];
    if (c.website) meta.push('<a href="' + esc(c.website) + '" target="_blank" rel="noopener">Official site</a>');
    if (c.note) meta.push('<span style="color:var(--text-faint)">' + esc(c.note) + '</span>');
    return '<div class="finder-result">' +
      '<h3>' + esc(c.name) + '</h3>' +
      bits.join("") +
      channels(c.name, { email: c.email, tel: c.phone }) +
      (meta.length ? '<div class="demand-meta" style="margin-top:10px;">' + meta.join("") + '</div>' : "") +
    '</div>';
  }

  function renderOffices() {
    el("offices").innerHTML = OFFICES.map(function (g) {
      return g.contacts.map(officeHtml).join("");
    }).join("");
  }

  // ---- send dispatch --------------------------------------------------

  function onSend(e) {
    var t = e.target.closest("[data-send]");
    if (!t) return;
    var kind = t.getAttribute("data-send");
    var to = t.getAttribute("data-to");
    var text = personalise(to);

    if (kind === "wa") {
      t.href = CAActions.whatsappLink(text, t.getAttribute("data-num"));
      if (window.CAShare) setTimeout(function () { CAShare.afterSend(seededDemand()); }, 600);
      return; // let the anchor open
    }
    if (kind === "mail") {
      e.preventDefault();
      window.location.href = CAActions.mailtoLink(text, t.getAttribute("data-email"), t.getAttribute("data-subject"));
      if (window.CAShare) setTimeout(function () { CAShare.afterSend(seededDemand()); }, 600);
      return;
    }
    if (kind === "copy") {
      e.preventDefault();
      var label = t;
      navigator.clipboard && navigator.clipboard.writeText(text).then(function () {
        var old = label.innerHTML;
        label.innerHTML = label.innerHTML.replace(/Copy/, "Copied");
        setTimeout(function () { label.innerHTML = old; }, 1600);
      }).catch(function () {});
    }
  }

  // ---- boot -----------------------------------------------------------

  document.addEventListener("DOMContentLoaded", async function () {
    msgEl = el("msg"); qEl = el("q"); resultsEl = el("results");
    countEl = el("count"); seedEl = el("demand-seed");

    msgEl.value = GENERAL_DRAFT;

    // Seed the demand dropdown from whatever list we have (snapshot works offline).
    var demands = CAStore.getDemands();
    if (!demands.length) { try { demands = await CAStore.refresh(); } catch (e) {} }
    demands.forEach(function (d) {
      var o = document.createElement("option");
      o.value = d.id; o.textContent = d.title;
      seedEl.appendChild(o);
    });
    // If arrived as contacts.html?demand=ID, preselect it.
    var pre = new URLSearchParams(location.search).get("demand");
    if (pre && demands.some(function (d) { return d.id === pre; })) {
      seedEl.value = pre; seedMessage();
    }
    seedEl.addEventListener("change", seedMessage);

    var offices = await CAStore.cachedJson("data/contacts.json", "ca_contacts_cache");
    OFFICES = (offices && offices.groups) || [];
    renderOffices();

    var mpData = await CAStore.cachedJson("data/mps.json", "ca_mps_cache");
    MPS = (mpData && mpData.mps) || [];
    renderResults();

    var timer;
    qEl.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(renderResults, 120);
    });

    document.addEventListener("click", onSend);
  });
})();
