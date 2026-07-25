(function () {
  var acceptedEl, proposedEl, proposedSection, noticeEl, statusEl, tallyEl, cloudEl, cloudWrap;
  var busy = {}; // demandId -> true, stops double-taps racing the server

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

  function notice(msg, isError) {
    if (!msg) { noticeEl.hidden = true; return; }
    noticeEl.textContent = msg;
    noticeEl.classList.toggle("error", !!isError);
    noticeEl.hidden = false;
  }

  function setStatus() {
    var queued = CAOutbox.size();
    if (!navigator.onLine) {
      statusEl.hidden = false;
      statusEl.textContent = queued
        ? "Offline. " + queued + " change" + (queued === 1 ? "" : "s") + " saved here, will send when you're back."
        : "Offline. Showing the last list saved on this phone.";
    } else if (queued) {
      statusEl.hidden = false;
      statusEl.textContent = "Sending " + queued + " saved change" + (queued === 1 ? "" : "s") + "…";
    } else if (!CASupabase.configured()) {
      statusEl.hidden = false;
      statusEl.textContent = "Read-only: no database configured yet. Voting is off.";
    } else if (CASupabase.state() === "disabled") {
      statusEl.hidden = false;
      statusEl.textContent = "Voting isn't switched on yet. The list below is current.";
    } else if (CASupabase.state() === "error") {
      statusEl.hidden = false;
      statusEl.textContent = "Can't reach the database. Showing the last published list.";
    } else {
      statusEl.hidden = true;
    }
  }

  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 14 7-7 7 7"/></svg>';

  function demandHtml(d, mine) {
    var voted = !!mine[d.id];
    return '<li class="demand">' +
      '<div class="vote-block">' +
        '<button class="vote-btn" data-vote="' + esc(d.id) + '" aria-pressed="' + voted + '" ' +
          'aria-label="' + (voted ? "Remove your vote from" : "Back") + ' ' + esc(d.title) + '">' + ARROW + '</button>' +
        '<span class="vote-count">' + (d.votes || 0) + '</span>' +
      '</div>' +
      '<div class="demand-body">' +
        '<h3>' + esc(d.title) + '</h3>' +
        '<p>' + esc(d.text) + '</p>' +
        '<div class="demand-meta"><a href="act.html?demand=' + encodeURIComponent(d.id) + '">Act on this &rarr;</a>' +
          '<button class="textlink share-link" data-share="' + esc(d.id) + '">Share</button></div>' +
      '</div>' +
    '</li>';
  }

  // ---- word cloud: engagement, drawn from demand titles weighted by votes ----

  var STOP = ("the a an and or of to for in on at by with from into over under is are be " +
    "this that these those it its as no not all any their our your an be into re " +
    "public every each fair into gets who whom been has have").split(" ");
  var stop = {}; STOP.forEach(function (w) { stop[w] = 1; });

  function renderCloud(list) {
    var weight = {};
    list.forEach(function (d) {
      var v = (d.votes || 0) + 1;
      (d.title || "").toLowerCase().split(/[^a-z]+/).forEach(function (w) {
        if (w.length < 4 || stop[w]) return;
        weight[w] = (weight[w] || 0) + v;
      });
    });
    var words = Object.keys(weight).map(function (w) { return [w, weight[w]]; });
    if (words.length < 6) { cloudWrap.hidden = true; return; }
    words.sort(function (a, b) { return b[1] - a[1]; });
    words = words.slice(0, 32);

    var max = words[0][1], min = words[words.length - 1][1];
    var span = Math.max(1, max - min);
    cloudEl.innerHTML = words
      .sort(function () { return 0; }) // keep weight order; visually varied by size
      .map(function (p) {
        var t = (p[1] - min) / span;               // 0..1
        var size = (15 + Math.round(t * 26));      // 15..41px
        var hot = t > 0.6 ? " hot" : "";
        var tag = t > 0.66 ? "b" : "span";
        return '<span class="w' + hot + '" style="font-size:' + size + 'px"><' + tag + '>' + esc(p[0]) + '</' + tag + '></span>';
      }).join("");
    cloudWrap.hidden = false;
  }

  // ---- render ----

  function render() {
    var list = CAStore.getDemands().slice();
    var mine = CAStore.getMyVotes();

    var accepted = list.filter(function (d) { return d.status !== "proposed"; })
                       .sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); });
    var proposed = list.filter(function (d) { return d.status === "proposed"; })
                       .sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); });

    acceptedEl.innerHTML = accepted.length
      ? accepted.map(function (d) { return demandHtml(d, mine); }).join("")
      : '<li class="empty">Nothing on the list yet.</li>';

    if (proposed.length) {
      proposedEl.innerHTML = proposed.map(function (d) { return demandHtml(d, mine); }).join("");
      proposedSection.hidden = false;
    } else {
      proposedSection.hidden = true;
    }

    var total = list.reduce(function (s, d) { return s + (d.votes || 0); }, 0);
    tallyEl.textContent = accepted.length + " up for a vote" +
      (proposed.length ? " · " + proposed.length + " proposed" : "") +
      (total ? " · " + total.toLocaleString() + " votes" : "");

    renderCloud(list);
  }

  // ---- voting ----

  async function onVote(id, btn) {
    if (busy[id]) return;
    busy[id] = true;
    btn.disabled = true;
    try {
      var res = await CAStore.toggleVote(id);
      var nowVoted = !!CAStore.getMyVotes()[id];
      notice(res.queued ? "Saved on this phone. It'll send when you're back online." : null);
      if (nowVoted) {
        // Peak moment: they just backed it and the number ticked up. Bump the
        // count, then hand them the share.
        var countEl = btn.parentNode.querySelector(".vote-count");
        if (countEl) { countEl.classList.remove("bump"); void countEl.offsetWidth; countEl.classList.add("bump"); }
        var d = CAStore.getDemands().find(function (x) { return x.id === id; });
        if (d && window.CAShare) CAShare.afterVote(d);
      }
    } catch (err) {
      var msg = /slow down/i.test(err.message || "")
        ? "That's a lot of taps. Give it a second."
        : (err.code === "PGRST202" || err.code === "PGRST205")
          ? "Voting isn't set up yet on this site."
          : "Couldn't record that vote. Try again in a moment.";
      notice(msg, true);
    } finally {
      delete busy[id];
      btn.disabled = false;
      setStatus();
    }
  }

  // ---- propose ----

  async function onPropose(e) {
    e.preventDefault();
    var title = document.getElementById("p-title").value.trim();
    var body = document.getElementById("p-body").value.trim();
    var submit = document.getElementById("propose-submit");
    if (title.length < 8) return notice("Give the demand a slightly longer title.", true);
    if (body.length < 20) return notice("Add a bit more detail to the demand itself.", true);

    submit.disabled = true;
    try {
      var res = await CAStore.propose(title, body);
      document.getElementById("propose-form").reset();
      document.getElementById("propose-form").hidden = true;
      notice(res.queued
        ? "Saved on this phone. It'll go to the queue when you're back online."
        : "It's on the list. Get it backed.");
      if (!res.queued && window.CAShare) CAShare.afterPropose({ title: title, votes: 0 });
      CAStore.refresh().catch(function () {});
    } catch (err) {
      var setup = err.code === "PGRST202" || err.code === "PGRST205" || /does not exist|schema cache/i.test(err.message || "");
      notice(setup ? "Adding demands isn't set up yet on this site."
        : /limit/i.test(err.message || "") ? "You've added a few already. Try again in an hour."
        : "Couldn't send that. Try again in a moment.", true);
    } finally {
      submit.disabled = false;
    }
  }

  // ---- feedback ----

  async function onFeedback(e) {
    e.preventDefault();
    var msg = document.getElementById("f-msg").value.trim();
    var name = document.getElementById("f-name").value.trim();
    var contact = document.getElementById("f-contact").value.trim();
    var submit = document.getElementById("f-submit");
    if (!msg) return notice("Write a short message first.", true);

    submit.disabled = true;
    try {
      await CAStore.submitFeedback(msg, name, contact);
      document.getElementById("feedback-form").reset();
      notice(contact ? "Sent. Someone may reach out." : "Sent. Thank you.");
    } catch (err) {
      var setup = err.code === "PGRST202" || err.code === "PGRST205" || /not configured|does not exist|schema cache/i.test(err.message || "");
      notice(setup ? "Feedback isn't set up yet on this site."
        : /too much/i.test(err.message || "") ? "That's a few in a row. Try again shortly."
        : "Couldn't send that. Try again in a moment.", true);
    } finally {
      submit.disabled = false;
    }
  }

  // ---- boot ----

  document.addEventListener("DOMContentLoaded", function () {
    acceptedEl = document.getElementById("accepted-list");
    proposedEl = document.getElementById("proposed-list");
    proposedSection = document.getElementById("proposed-section");
    noticeEl = document.getElementById("notice");
    statusEl = document.getElementById("status-line");
    tallyEl = document.getElementById("tally");
    cloudEl = document.getElementById("cloud");
    cloudWrap = document.getElementById("cloud-wrap");

    render();
    setStatus();

    document.getElementById("accepted-list").addEventListener("click", voteClick);
    document.getElementById("proposed-list").addEventListener("click", voteClick);
    function voteClick(e) {
      var share = e.target.closest("[data-share]");
      if (share && window.CAShare) {
        var d = CAStore.getDemands().find(function (x) { return x.id === share.getAttribute("data-share"); });
        if (d) CAShare.openSheet({ demand: d, eyebrow: "Spread it", title: "Send this demand", body: "Drop it in a group. Every forward is another name they can't ignore." });
        return;
      }
      var btn = e.target.closest("[data-vote]");
      if (btn) onVote(btn.getAttribute("data-vote"), btn);
    }

    var form = document.getElementById("propose-form");
    document.getElementById("propose-toggle").addEventListener("click", function () {
      form.hidden = !form.hidden;
      if (!form.hidden) document.getElementById("p-title").focus();
    });
    document.getElementById("propose-cancel").addEventListener("click", function () { form.hidden = true; });
    form.addEventListener("submit", onPropose);

    document.getElementById("feedback-form").addEventListener("submit", onFeedback);

    var exportBtn = document.querySelector("[data-export-outbox]");
    if (exportBtn) exportBtn.addEventListener("click", CAOutbox.exportJson);

    CAStore.refresh().catch(function () {});
    CAOutbox.flush().then(setStatus).catch(function () {});
  });

  document.addEventListener("ca:demands-changed", render);
  document.addEventListener("ca:outbox-changed", setStatus);
  window.addEventListener("online", function () {
    setStatus();
    CAOutbox.flush().then(function () { return CAStore.refresh(); }).then(setStatus).catch(function () {});
  });
  window.addEventListener("offline", setStatus);
})();
