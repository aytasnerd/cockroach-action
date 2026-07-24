(function () {
  var listEl, sortSelect;

  function render() {
    var demands = CAStore.getDemands().slice();
    var votes = CAStore.getVotes();
    var sort = sortSelect ? sortSelect.value : "votes";

    if (sort === "votes") demands.sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); });
    else if (sort === "new") demands.sort(function (a, b) { return (b.proposed ? 1 : 0) - (a.proposed ? 1 : 0); });

    listEl.innerHTML = "";

    if (!demands.length) {
      listEl.innerHTML = '<p class="lede">No demands loaded yet. Connect once to fetch the starting list. After that this page works fully offline.</p>';
      return;
    }

    demands.forEach(function (d) {
      var li = document.createElement("li");
      li.className = "demand";
      var pressed = votes[d.id] === 1;
      var voteIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
      li.innerHTML =
        '<div class="vote-block">' +
          '<button class="vote-btn" aria-pressed="' + pressed + '" data-vote="' + d.id + '" aria-label="Support this demand">' + voteIcon + '</button>' +
          '<span class="vote-count">' + (d.votes || 0) + '</span>' +
        '</div>' +
        '<div class="demand-body">' +
          '<h3>' + escapeHtml(d.title) + '</h3>' +
          '<p>' + escapeHtml(d.text) + '</p>' +
          '<div class="demand-meta">' +
            (d.proposed ? '<span class="tag">Proposed</span>' : '<span class="tag">Standard</span>') +
            '<a href="act.html?demand=' + encodeURIComponent(d.id) + '">Act on this &rarr;</a>' +
          '</div>' +
        '</div>';
      listEl.appendChild(li);
    });

    listEl.querySelectorAll("[data-vote]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        CAStore.vote(btn.getAttribute("data-vote"), 1);
      });
    });
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  var MOOD_WORDS = ["Hopeful", "Angry", "Tired", "Determined", "Anxious", "Proud", "Frustrated", "United"];

  function renderMood() {
    var tally = CAStore.getMood();
    var el = document.getElementById("mood-tally");
    if (!el) return;
    var entries = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; });
    if (!entries.length) {
      el.textContent = "No check-ins on this phone yet.";
      return;
    }
    el.textContent = "On this phone so far: " + entries.map(function (w) { return w + " (" + tally[w] + ")"; }).join(", ");
  }

  function buildMoodButtons() {
    var wrap = document.getElementById("mood-buttons");
    if (!wrap) return;
    MOOD_WORDS.forEach(function (word) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "channel-btn";
      btn.textContent = word;
      btn.addEventListener("click", function () { CAStore.checkInMood(word); });
      wrap.appendChild(btn);
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    listEl = document.getElementById("demand-list");
    sortSelect = document.getElementById("sort-select");
    await CAStore.ensureSeeded();
    render();
    if (sortSelect) sortSelect.addEventListener("change", render);
    document.addEventListener("ca:demands-changed", render);

    buildMoodButtons();
    renderMood();
    document.addEventListener("ca:mood-changed", renderMood);

    var form = document.getElementById("propose-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var title = document.getElementById("propose-title").value.trim();
        var text = document.getElementById("propose-text").value.trim();
        if (!title || !text) return;
        CAStore.proposeDemand(title, text);
        form.reset();
        form.hidden = true;
        document.getElementById("propose-toggle").hidden = false;
      });
    }
  });
})();
