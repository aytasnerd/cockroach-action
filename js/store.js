// Local-first data layer.
//
// There is no server here. Everything reads and writes to the
// browser's own localStorage, and the service worker (sw.js)
// caches the actual data files, so every page keeps working with
// zero signal. Syncing just means this: when the phone has
// internet, ask the network for the latest data/demands.json
// (which organizers update after each in-person round) and
// refresh the local copy. No accounts, no backend, no server-side
// merge logic.
//
// Your own votes and any demand you propose stay on this device.
// The Export button on the demands page lets you hand that off to
// an organizer in person, since there is no server to collect it
// automatically.

var CAStore = (function () {
  var KEYS = {
    demands: "ca_demands",
    votes: "ca_votes", // { demandId: 1 | -1 | 0 (local vote state) }
    outbox: "ca_outbox", // array of {type, payload, ts}, your own local activity, for manual export
    seeded: "ca_seeded_at",
    mood: "ca_mood", // { word: count }, this device's own check-ins only
  };

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // Load the seed file once, then always prefer whatever is in
  // localStorage (which includes local votes + any proposed demands).
  async function ensureSeeded() {
    var existing = read(KEYS.demands, null);
    if (existing) return existing;
    try {
      var res = await fetch("data/demands.json", { cache: "no-store" });
      var json = await res.json();
      write(KEYS.demands, json.demands);
      write(KEYS.seeded, new Date().toISOString());
      return json.demands;
    } catch (e) {
      // Fully offline on first-ever load with no cached copy. Nothing to show.
      write(KEYS.demands, []);
      return [];
    }
  }

  function getDemands() {
    return read(KEYS.demands, []);
  }

  function saveDemands(list) {
    write(KEYS.demands, list);
  }

  // Called when the phone has internet: pulls the latest published
  // demand list and refreshes the local copy, but keeps anything
  // this device proposed locally that hasn't made it into the
  // published list yet, plus this device's own vote marks so its
  // arrows still show as pressed.
  async function refreshFromNetwork() {
    if (!navigator.onLine) return false;
    try {
      var res = await fetch("data/demands.json", { cache: "no-store" });
      if (!res.ok) return false;
      var json = await res.json();
      var localOnly = getDemands().filter(function (d) { return d.proposed; });
      var merged = json.demands.concat(localOnly);
      saveDemands(merged);
      write(KEYS.seeded, new Date().toISOString());
      document.dispatchEvent(new CustomEvent("ca:demands-changed"));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Generic fetch, with a fallback to whatever we last saw. Used by
  // pages (contacts, RTI template) that don't otherwise keep a
  // localStorage-backed copy, so a phone that loses signal mid-visit
  // (or whose service worker didn't register, e.g. some private
  // browsing modes) still has something to show.
  async function cachedJsonFetch(url, cacheKey) {
    try {
      var res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        var json = await res.json();
        write(cacheKey, json);
        return json;
      }
    } catch (e) {
      // fall through to cache below
    }
    return read(cacheKey, null);
  }

  function getMood() {
    return read(KEYS.mood, {});
  }

  function checkInMood(word) {
    var mood = getMood();
    mood[word] = (mood[word] || 0) + 1;
    write(KEYS.mood, mood);
    enqueue("mood", { word: word });
    document.dispatchEvent(new CustomEvent("ca:mood-changed"));
  }

  function getVotes() {
    return read(KEYS.votes, {});
  }

  function enqueue(type, payload) {
    var outbox = read(KEYS.outbox, []);
    outbox.push({ type: type, payload: payload, ts: Date.now() });
    write(KEYS.outbox, outbox);
    document.dispatchEvent(new CustomEvent("ca:outbox-changed"));
  }

  function getOutbox() {
    return read(KEYS.outbox, []);
  }

  function clearOutbox(sentCount) {
    var outbox = read(KEYS.outbox, []);
    write(KEYS.outbox, outbox.slice(sentCount));
    document.dispatchEvent(new CustomEvent("ca:outbox-changed"));
  }

  function vote(demandId, direction) {
    // direction: 1 (up), or 0 (undo)
    var votes = getVotes();
    var list = getDemands();
    var demand = list.find(function (d) { return d.id === demandId; });
    if (!demand) return;

    var prev = votes[demandId] || 0;
    var next = prev === direction ? 0 : direction;
    var delta = next - prev;

    demand.votes = (demand.votes || 0) + delta;
    votes[demandId] = next;

    saveDemands(list);
    write(KEYS.votes, votes);
    enqueue("vote", { demandId: demandId, direction: next });
    document.dispatchEvent(new CustomEvent("ca:demands-changed"));
  }

  function proposeDemand(title, text) {
    var list = getDemands();
    var id = "local-" + Date.now().toString(36);
    var demand = {
      id: id,
      title: title,
      text: text,
      votes: 1,
      proposed: true,
    };
    list.push(demand);
    saveDemands(list);

    var votes = getVotes();
    votes[id] = 1;
    write(KEYS.votes, votes);

    enqueue("propose", demand);
    document.dispatchEvent(new CustomEvent("ca:demands-changed"));
    return demand;
  }

  return {
    ensureSeeded: ensureSeeded,
    getDemands: getDemands,
    getVotes: getVotes,
    vote: vote,
    proposeDemand: proposeDemand,
    enqueue: enqueue,
    getOutbox: getOutbox,
    clearOutbox: clearOutbox,
    refreshFromNetwork: refreshFromNetwork,
    cachedJsonFetch: cachedJsonFetch,
    getMood: getMood,
    checkInMood: checkInMood,
  };
})();
