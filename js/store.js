// Data layer.
//
// Read path, in order of preference:
//   1. data/demands.json  - a snapshot committed by the GitHub Action and
//      served from the CDN. This is what first paint uses, always. It costs
//      the database nothing, which is the only reason this design survives a
//      traffic spike.
//   2. Supabase           - one indexed query that patches live vote counts
//      onto the snapshot. Small, cheap, and skipped entirely when offline.
//   3. localStorage       - last known good copy, for zero signal.
//
// Write path: everything goes through CAOutbox so it survives losing signal
// mid-tap.
//
// Note what is NOT here any more: the old build kept a per-device vote tally
// and called it a count. Counts now come from the server, so what you see is
// what everyone actually voted.

var CAStore = (function () {
  var cfg = window.CA_CONFIG || {};
  var KEYS = {
    demands: "ca_demands_v2",
    myVotes: "ca_my_votes_v2",
    updated: "ca_updated_at",
  };

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota */ }
  }

  function changed() {
    document.dispatchEvent(new CustomEvent("ca:demands-changed"));
  }

  // ---------------------------------------------------------------- reads

  function getDemands() { return read(KEYS.demands, []); }
  function getMyVotes() { return read(KEYS.myVotes, {}); }
  function lastUpdated() { return read(KEYS.updated, null); }

  async function loadSnapshot() {
    var res = await fetch(cfg.SNAPSHOT_URL || "data/demands.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("snapshot " + res.status);
    var json = await res.json();
    return (json.demands || []).map(function (d) {
      return {
        id: d.id,
        slug: d.slug,
        title: d.title,
        text: d.text,
        votes: d.votes || 0,
        status: "accepted",
      };
    });
  }

  // One query, one index. Pulls both the accepted list and open proposals, so
  // people can see and back proposals too. This is the only per-visitor
  // database read in the whole app.
  async function patchLiveCounts(list) {
    if (!CASupabase.configured() || !navigator.onLine) return list;
    try {
      var rows = await CASupabase.select(
        "demands",
        "select=id,slug,title,body,status,vote_count,offline_votes&status=in.(accepted,proposed)&order=vote_count.desc"
      );
      if (!rows || !rows.length) return list;
      return rows.map(function (r) {
        return {
          id: r.id,
          slug: r.slug,
          title: r.title,
          text: r.body,
          votes: (r.vote_count || 0) + (r.offline_votes || 0),
          status: r.status,
        };
      });
    } catch (e) {
      return list; // stale-but-shown beats empty
    }
  }

  async function loadMyVotes() {
    if (!CASupabase.configured() || !navigator.onLine) return getMyVotes();
    try {
      var s = await CASupabase.session({ createIfMissing: false });
      if (!s) return getMyVotes();
      var rows = await CASupabase.select("votes", "select=demand_id");
      var map = {};
      (rows || []).forEach(function (r) { map[r.demand_id] = true; });
      write(KEYS.myVotes, map);
      return map;
    } catch (e) {
      return getMyVotes();
    }
  }

  // Full refresh. Safe to call on every page load and on reconnect.
  async function refresh() {
    var list = getDemands();
    try {
      list = await loadSnapshot();
    } catch (e) {
      if (!list.length) list = [];
    }
    list = await patchLiveCounts(list);

    if (list.length) {
      write(KEYS.demands, list);
      write(KEYS.updated, new Date().toISOString());
    }
    await loadMyVotes();
    changed();
    return list;
  }

  // ---------------------------------------------------------------- writes

  // Reconciles one demand to a desired vote state. Used both by a live tap
  // and by the outbox replaying an intent recorded while offline.
  //
  // We send the desired end state rather than a toggle, so this is safe to
  // call when the server already agrees. Do NOT re-add a local short-circuit
  // here: toggleVote writes the optimistic state before calling this, so any
  // check against local state matches immediately and the vote never sends.
  async function applyVoteIntent(demandId, wantVoted) {
    var out = await CASupabase.rpc("cast_vote", { p_demand: demandId, p_voted: wantVoted });
    var row = Array.isArray(out) ? out[0] : out;
    var votes = getMyVotes();

    if (row) {
      if (row.voted) votes[demandId] = true; else delete votes[demandId];
      write(KEYS.myVotes, votes);

      var list = getDemands();
      var d = list.find(function (x) { return x.id === demandId; });
      if (d) { d.votes = row.vote_count; write(KEYS.demands, list); }
    }
    return { changed: true };
  }

  // What the arrow calls. Updates the UI immediately, then reconciles.
  async function toggleVote(demandId) {
    var votes = getMyVotes();
    var wantVoted = !votes[demandId];

    // Optimistic: move the number now so the tap feels instant.
    var list = getDemands();
    var d = list.find(function (x) { return x.id === demandId; });
    if (d) d.votes = Math.max(0, (d.votes || 0) + (wantVoted ? 1 : -1));
    if (wantVoted) votes[demandId] = true; else delete votes[demandId];
    write(KEYS.myVotes, votes);
    write(KEYS.demands, list);
    changed();

    if (!navigator.onLine || !CASupabase.configured()) {
      CAOutbox.add("vote", { demandId: demandId, wantVoted: wantVoted });
      return { queued: true };
    }

    try {
      await applyVoteIntent(demandId, wantVoted);
      changed();
      return { queued: false };
    } catch (err) {
      if (err && err.status && err.status < 500) {
        // Server refused (rate limit, demand not accepted). Roll the
        // optimistic change back rather than showing a number that is a lie.
        if (d) d.votes = Math.max(0, (d.votes || 0) + (wantVoted ? -1 : 1));
        if (wantVoted) delete votes[demandId]; else votes[demandId] = true;
        write(KEYS.myVotes, votes);
        write(KEYS.demands, list);
        changed();
        throw err;
      }
      CAOutbox.add("vote", { demandId: demandId, wantVoted: wantVoted });
      return { queued: true };
    }
  }

  async function propose(title, body) {
    if (!navigator.onLine || !CASupabase.configured()) {
      CAOutbox.add("propose", { title: title, body: body, clientKey: Date.now().toString(36) });
      return { queued: true };
    }
    await CASupabase.rpc("propose_demand", {
      p_title: title,
      p_body: body,
      p_chapter: cfg.CHAPTER || "default",
    });
    return { queued: false };
  }

  async function submitFeedback(message, name, contact) {
    if (!CASupabase.configured()) throw new Error("not configured");
    return CASupabase.rpc("submit_feedback", {
      p_message: message,
      p_name: name || null,
      p_contact: contact || null,
      p_chapter: cfg.CHAPTER || "default",
    });
  }

  // Generic cached fetch for contacts + RTI template.
  async function cachedJson(url, cacheKey) {
    try {
      var res = await fetch(url, { cache: "no-cache" });
      if (res.ok) {
        var json = await res.json();
        write(cacheKey, json);
        return json;
      }
    } catch (e) { /* fall through */ }
    return read(cacheKey, null);
  }

  return {
    getDemands: getDemands,
    getMyVotes: getMyVotes,
    lastUpdated: lastUpdated,
    refresh: refresh,
    toggleVote: toggleVote,
    applyVoteIntent: applyVoteIntent,
    propose: propose,
    submitFeedback: submitFeedback,
    cachedJson: cachedJson,
  };
})();
