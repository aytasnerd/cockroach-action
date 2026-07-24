(function () {
  var SHARE_TEXT = "One list of demands, voted on together, sent straight to the offices that can answer:";

  function shareUrl() {
    return location.href.split("#")[0].replace(/index\.html$/, "");
  }

  function paintStats() {
    var list = CAStore.getDemands();
    if (!list.length) return;
    var votes = list.reduce(function (sum, d) { return sum + (d.votes || 0); }, 0);
    document.getElementById("stat-demands").textContent = list.length;
    document.getElementById("stat-votes").textContent = votes.toLocaleString();
    // stat-mps is a static count of the MP roll; leave it as authored.
  }

  function wireShare() {
    var url = shareUrl();
    var msg = SHARE_TEXT + " " + url;
    document.getElementById("share-wa").href = "https://wa.me/?text=" + encodeURIComponent(msg);
    document.getElementById("share-x").href =
      "https://twitter.com/intent/tweet?text=" + encodeURIComponent(SHARE_TEXT) + "&url=" + encodeURIComponent(url);

    var copyBtn = document.getElementById("share-copy");
    var feedback = document.getElementById("share-feedback");

    copyBtn.addEventListener("click", async function () {
      // The native share sheet is much better on a phone, so prefer it.
      if (navigator.share) {
        try {
          await navigator.share({ title: "Cockroach Action", text: SHARE_TEXT, url: url });
          return;
        } catch (e) {
          if (e && e.name === "AbortError") return; // user dismissed, not an error
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        feedback.textContent = "Copied";
      } catch (e) {
        // Clipboard is blocked in some browsers and in insecure contexts.
        // Say so rather than looking like nothing happened.
        feedback.textContent = "Press and hold the address bar to copy";
      }
      feedback.classList.add("show");
      setTimeout(function () { feedback.classList.remove("show"); }, 2400);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    wireShare();
    paintStats();
    CAStore.refresh().then(paintStats).catch(function () {});
  });

  document.addEventListener("ca:demands-changed", paintStats);
})();
