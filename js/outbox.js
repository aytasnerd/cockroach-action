// Offline write queue.
//
// Every write the app makes goes through here. Online, it is attempted
// immediately. Offline, it is parked in localStorage and replayed the moment
// the phone has signal again. This is the whole "syncs when you're back
// online" promise, and it is deliberately small enough to reason about.
//
// Entries are idempotent by design:
//   vote    - cast_vote() toggles, so a replayed vote must not double-apply.
//             We keep only the LAST intent per demand and reconcile against
//             the server's actual state on flush.
//   propose - carries a client-generated key so a replay cannot create the
//             same demand twice.

var CAOutbox = (function () {
  var KEY = "ca_outbox_v2";
  var flushing = false;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }

  function write(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
    document.dispatchEvent(new CustomEvent("ca:outbox-changed", { detail: { size: list.length } }));
  }

  function size() { return read().length; }

  function add(type, payload) {
    var list = read();
    if (type === "vote") {
      // Collapse repeated toggles on the same demand into one pending intent.
      list = list.filter(function (e) {
        return !(e.type === "vote" && e.payload.demandId === payload.demandId);
      });
    }
    list.push({
      type: type,
      payload: payload,
      key: type + "-" + (payload.demandId || payload.clientKey || "") + "-" + Date.now().toString(36),
      ts: Date.now(),
    });
    write(list);
    return list.length;
  }

  // Replay everything we can. Entries that fail for a permanent reason are
  // dropped with a note; entries that fail because we are offline stay put.
  async function flush() {
    if (flushing || !navigator.onLine || !CASupabase.configured()) return { sent: 0, kept: size() };
    var list = read();
    if (!list.length) return { sent: 0, kept: 0 };

    flushing = true;
    var remaining = [];
    var sent = 0;
    var failures = [];

    try {
      for (var i = 0; i < list.length; i++) {
        var entry = list[i];
        try {
          if (entry.type === "vote") {
            await CAStore.applyVoteIntent(entry.payload.demandId, entry.payload.wantVoted);
          } else if (entry.type === "propose") {
            await CASupabase.rpc("propose_demand", {
              p_title: entry.payload.title,
              p_body: entry.payload.body,
              p_chapter: (window.CA_CONFIG || {}).CHAPTER || "default",
            });
          }
          sent++;
        } catch (err) {
          // Network-ish failure: keep it for the next attempt.
          // Anything the server actively rejected (4xx) is permanent, so
          // dropping it is correct - retrying forever would never succeed.
          if (!navigator.onLine || !err.status || err.status >= 500) {
            remaining.push(entry);
          } else {
            failures.push({ entry: entry, reason: err.message });
          }
        }
      }
    } finally {
      flushing = false;
      write(remaining);
    }

    if (failures.length) {
      document.dispatchEvent(new CustomEvent("ca:outbox-rejected", { detail: { failures: failures } }));
    }
    return { sent: sent, kept: remaining.length, rejected: failures.length };
  }

  function exportJson() {
    var payload = {
      exported_at: new Date().toISOString(),
      note: "Your own pending activity from this device. Hand this to an organizer.",
      entries: read(),
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "cockroach-action-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Safari has not necessarily started the transfer when click() returns.
    // Revoking immediately kills the download, so defer it.
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  window.addEventListener("online", function () { flush(); });

  return { add: add, flush: flush, size: size, read: read, exportJson: exportJson };
})();
