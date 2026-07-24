// Connectivity refresh. No server involved.
//
// This is a static site. Being in sync here means two things only.
// The service worker and localStorage keep the last saved copy of
// everything usable with zero signal, and the moment the phone has
// internet again, we quietly refetch the published demand list so
// this device catches up with whatever organizers posted after the
// last round. There is no account and nothing to configure.

var CASync = (function () {
  var REFRESH_INTERVAL_MS = 20000;
  var timer = null;

  function setStatus() {
    var line = document.getElementById("status-line");
    if (!line) return;
    if (!navigator.onLine) {
      line.hidden = false;
      var outboxLen = CAStore.getOutbox().length;
      line.textContent = outboxLen
        ? "Offline. Showing what's saved on this phone (" + outboxLen + " of your own entries stored here too)."
        : "Offline. Showing what's saved on this phone.";
    } else {
      line.hidden = true;
    }
  }

  async function refresh() {
    if (!navigator.onLine) {
      setStatus();
      return;
    }
    await CAStore.refreshFromNetwork();
    setStatus();
  }

  function exportOutbox() {
    var outbox = CAStore.getOutbox();
    var blob = new Blob([JSON.stringify(outbox, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "cockroach-action-my-activity-" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function init() {
    setStatus();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", setStatus);
    document.addEventListener("ca:outbox-changed", setStatus);
    document.addEventListener("DOMContentLoaded", function () {
      var exportBtn = document.querySelector("[data-export-outbox]");
      if (exportBtn) exportBtn.addEventListener("click", exportOutbox);
      refresh();
    });
    if (timer) clearInterval(timer);
    timer = setInterval(refresh, REFRESH_INTERVAL_MS);
  }

  init();

  return { refresh: refresh, exportOutbox: exportOutbox };
})();
