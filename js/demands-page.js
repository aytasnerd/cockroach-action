(function () {
  var listEl, noticeEl, statusEl, sortEl;
  var sortMode = "votes";
  var busy = {}; // demandId -> true, stops double-taps racing the server

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  }

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
    } else {
      statusEl.hidden = true;
    }
  }

  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 14 7-7 7 7"/></svg>';

  function render() {
    var list = CAStore.getDemands().slice();
    var mine = CAStore.getMyVotes();

    if (sortMode === "votes") {
      list.sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); });
    }

    if (!list.length) {
      listEl.innerHTML = '<li class="empty">Nothing on the list yet. Add the first demand.</li>';
      return;
    }

    listEl.innerHTML = list.map(function (d) {
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
          '<div class="demand-meta">' +
            '<a href="act.html?demand=' + encodeURIComponent(d.id) + '">Act on this &rarr;</a>' +
          '</div>' +
        '</div>' +
      '</li>';
    }).join("");
  }

  async function onVote(id, btn) {
    if (busy[id]) return;
    busy[id] = true;
    btn.disabled = true;
    try {
      var res = await CAStore.toggleVote(id);
      notice(res.queued ? "Saved on this phone. It'll send when you're back online." : null);
    } catch (err) {
      var msg = /slow down/i.test(err.message || "")
        ? "That's a lot of taps. Give it a second."
        : "Couldn't record that vote. " + (err.message || "");
      notice(msg, true);
    } finally {
      delete busy[id];
      btn.disabled = false;
      setStatus();
    }
  }

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
        : "Sent to the queue. An organizer will review it.");
    } catch (err) {
      notice(/limit/i.test(err.message || "")
        ? "You've added a few already. Try again in an hour."
        : "Couldn't send that. " + (err.message || ""), true);
    } finally {
      submit.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    listEl = document.getElementById("demand-list");
    noticeEl = document.getElementById("notice");
    statusEl = document.getElementById("status-line");
    sortEl = document.getElementById("sort");

    render();
    setStatus();

    listEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-vote]");
      if (btn) onVote(btn.getAttribute("data-vote"), btn);
    });

    sortEl.addEventListener("change", function () { sortMode = sortEl.value; render(); });

    var form = document.getElementById("propose-form");
    document.getElementById("propose-toggle").addEventListener("click", function () {
      form.hidden = !form.hidden;
      if (!form.hidden) document.getElementById("p-title").focus();
    });
    document.getElementById("propose-cancel").addEventListener("click", function () { form.hidden = true; });
    form.addEventListener("submit", onPropose);

    var exportBtn = document.querySelector("[data-export-outbox]");
    if (exportBtn) exportBtn.addEventListener("click", CAOutbox.exportJson);

    CAStore.refresh().catch(function () {});
    CAOutbox.flush().then(setStatus).catch(function () {});
  });

  document.addEventListener("ca:demands-changed", function () { render(); });
  document.addEventListener("ca:outbox-changed", setStatus);
  window.addEventListener("online", function () {
    setStatus();
    CAOutbox.flush().then(function () { return CAStore.refresh(); }).then(setStatus).catch(function () {});
  });
  window.addEventListener("offline", setStatus);
})();
