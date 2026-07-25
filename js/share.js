// The spread engine.
//
// Virality is a loop: someone acts, feels it, and is handed a way to pull in
// three more at the exact moment they feel it. This module is that "hand it to
// them" step - a share sheet fired at each commitment peak (vote, propose,
// send), plus a downloadable poster people can drop into a WhatsApp status or
// an Instagram story.
//
// Everything is self-contained: no libraries, no external fonts. The poster is
// an inline SVG rasterised to PNG in a canvas, so it works offline and can be
// handed straight to the native share sheet as a file.

var CAShare = (function () {
  var SITE = "https://aytasnerd.github.io/cockroach-action/";
  var SHORT = "aytasnerd.github.io/cockroach-action";

  function fmt(n) { return (n || 0).toLocaleString("en-IN"); }

  // ---- forward copy: stakes + a live number + us-vs-them -------------------

  // The single most-forwarded string in the app. Names the grievance, carries
  // a live number, ends on an ask.
  function shareText(opts) {
    opts = opts || {};
    if (opts.demand) {
      var c = (opts.demand.votes || 0);
      var lead = c > 20 ? fmt(c) + " people are demanding this: " : "";
      return "They leaked the exam and hoped we'd forget.\n\n" +
        lead + "“" + opts.demand.title + "”\n\n" +
        "Add your name → " + SITE;
    }
    var total = opts.total || 0;
    var proof = total > 50 ? fmt(total) + " people have already signed the demands. " : "";
    return "They leaked the exam and hoped we'd forget.\n\n" +
      proof + "See what India is demanding, and add your voice in one tap → " + SITE;
  }

  function waLink(text) { return "https://wa.me/?text=" + encodeURIComponent(text); }
  function xLink(text) { return "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text); }

  // ---- poster -------------------------------------------------------------

  // Wrap a title into up to 3 balanced lines for the poster's display face.
  function wrapTitle(title, maxChars) {
    var words = (title || "").split(/\s+/);
    var lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + " " + words[i] : words[i];
      if (test.length > maxChars && cur) { lines.push(cur); cur = words[i]; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = lines[2].replace(/.{0,3}$/, "…"); }
    return lines;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // The poster's condensed face (Anton) is not installed on any device, and an
  // SVG rendered as an image can't see the page's @font-face rules. So we embed
  // the woff2 as base64 directly in the SVG. Fetched once, then cached.
  var antonCssPromise = null;
  function antonCss() {
    if (antonCssPromise) return antonCssPromise;
    antonCssPromise = fetch("fonts/anton-400.woff2")
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) {
        var bytes = new Uint8Array(buf), bin = "";
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        var b64 = btoa(bin);
        return "@font-face{font-family:'Anton';src:url(data:font/woff2;base64," + b64 + ") format('woff2');}";
      })
      .catch(function () { return ""; }); // fall back to condensed system stack
    return antonCssPromise;
  }

  function posterSvg(demand, fontCss) {
    var lines = wrapTitle((demand.title || "").toUpperCase(), 15);
    var startY = 430, lh = 96;
    var tspans = lines.map(function (ln, i) {
      return '<tspan x="88" y="' + (startY + i * lh) + '">' + esc(ln) + '</tspan>';
    }).join("");
    var countY = startY + (lines.length - 1) * lh + 220;
    var votes = demand.votes || 0;
    var big = votes > 20 ? fmt(votes) : "BE FIRST";
    var sub = votes > 20 ? "PEOPLE ARE DEMANDING THIS" : "TO DEMAND THIS";
    var disp = "'Anton','Arial Narrow',Impact,sans-serif";
    var sans = "Helvetica,Arial,sans-serif";

    return '<svg viewBox="0 0 1080 1350" width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><style>' + (fontCss || "") + '</style></defs>' +
      '<rect width="1080" height="1350" fill="#1a120b"/>' +
      '<rect x="0" y="0" width="1080" height="14" fill="#b23a15"/>' +
      '<rect x="42" y="46" width="996" height="1258" fill="none" stroke="#7a6a55" stroke-opacity="0.4" stroke-width="1.5"/>' +
      '<g transform="translate(88,96) scale(2.6)" stroke="#f4ede0" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M10 4.2C8.5 2.6 7 1.9 5.4 1.8"/><path d="M14 4.2c1.5-1.6 3-2.3 4.6-2.4"/><ellipse cx="12" cy="6.2" rx="2.5" ry="2"/>' +
      '<path d="M12 8.2c3.6 0 5 2.8 5 6.2 0 4-2.2 7.2-5 7.2s-5-3.2-5-7.2c0-3.4 1.4-6.2 5-6.2Z"/><path d="M12 9.6v10"/>' +
      '<path d="M7.4 10.6 3.0 7.8"/><path d="M6.9 14.4 2.3 14.1"/><path d="M7.6 18 3.7 21.0"/>' +
      '<path d="M16.6 10.6 21.0 7.8"/><path d="M17.1 14.4 21.7 14.1"/><path d="M16.4 18 20.3 21.0"/></g>' +
      '<text x="176" y="150" font-family="' + sans + '" font-size="30" font-weight="700" letter-spacing="8" fill="#f4ede0">COCKROACH ACTION</text>' +
      '<line x1="88" y1="212" x2="992" y2="212" stroke="#f4ede0" stroke-opacity="0.32" stroke-width="2"/>' +
      '<text x="88" y="312" font-family="' + sans + '" font-size="26" font-weight="700" letter-spacing="4" fill="#ef7a2e">THE NTA EXAM-PAPER LEAK</text>' +
      '<text font-family="' + disp + '" font-size="104" fill="#f4ede0" letter-spacing="0.5">' + tspans + '</text>' +
      '<text x="88" y="' + countY + '" font-family="' + disp + '" font-size="132" fill="#ef7a2e">' + esc(big) + '</text>' +
      '<text x="88" y="' + (countY + 52) + '" font-family="' + sans + '" font-size="28" font-weight="700" letter-spacing="3" fill="#b89a82">' + esc(sub) + '</text>' +
      '<text x="88" y="' + (countY + 168) + '" font-family="' + disp + '" font-size="92" fill="#f4ede0">ADD YOUR NAME.</text>' +
      '<line x1="88" y1="1156" x2="992" y2="1156" stroke="#f4ede0" stroke-opacity="0.32" stroke-width="2"/>' +
      '<text x="88" y="1222" font-family="' + sans + '" font-size="40" font-weight="700" letter-spacing="0.5" fill="#ef7a2e">' + SHORT + '</text>' +
      '<text x="88" y="1272" font-family="' + sans + '" font-size="26" font-weight="600" letter-spacing="2" fill="#f4ede0">VOTE. SEND IT. MAKE THEM ANSWER.</text>' +
      '</svg>';
  }

  async function posterBlob(demand) {
    var fontCss = await antonCss();
    var svg = posterSvg(demand, fontCss);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = 1080; c.height = 1350;
        var ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("no blob")); }, "image/png", 0.92);
      };
      img.onerror = reject;
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }

  async function sharePoster(demand) {
    var blob;
    try { blob = await posterBlob(demand); }
    catch (e) { return; }
    var file = new File([blob], "cockroach-action.png", { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: shareText({ demand: demand }) });
        return;
      } catch (e) { if (e && e.name === "AbortError") return; }
    }
    // Fallback: download it so they can post it manually.
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "cockroach-action.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  // ---- the share sheet ----------------------------------------------------

  var WA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20.5l1.8-5.2A8.5 8.5 0 1 1 21 11.5Z"/></svg>';
  var X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l16 16M20 4 4 20"/></svg>';
  var COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  var POSTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  var overlay;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "share-overlay";
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    return overlay;
  }

  function close() { if (overlay) overlay.classList.remove("show"); }

  // opts: { eyebrow, title, body, demand } — demand enables the poster button
  function openSheet(opts) {
    opts = opts || {};
    var text = shareText(opts.demand ? { demand: opts.demand } : { total: opts.total });
    var o = ensureOverlay();
    o.innerHTML =
      '<div class="share-sheet" role="dialog" aria-modal="true" aria-label="Share">' +
        '<button class="share-close" aria-label="Close">' + CLOSE + '</button>' +
        (opts.eyebrow ? '<div class="eyebrow">' + esc(opts.eyebrow) + '</div>' : '') +
        '<h3>' + esc(opts.title || "You're in.") + '</h3>' +
        '<p>' + (opts.body || "It only counts if the next three see it.") + '</p>' +
        '<a class="share-primary" data-act="wa" href="' + waLink(text) + '" target="_blank" rel="noopener">' + WA + 'Send on WhatsApp</a>' +
        '<div class="share-secondary">' +
          '<button data-act="x">' + X + 'Post on X</button>' +
          '<button data-act="copy">' + COPY + 'Copy link</button>' +
          (opts.demand ? '<button data-act="poster">' + POSTER + 'Poster</button>' : '') +
        '</div>' +
      '</div>';

    o.querySelector(".share-close").addEventListener("click", close);
    o.querySelector('[data-act="x"]').addEventListener("click", function () { window.open(xLink(text), "_blank", "noopener"); });
    o.querySelector('[data-act="copy"]').addEventListener("click", function (e) {
      var b = e.currentTarget;
      navigator.clipboard && navigator.clipboard.writeText(text).then(function () {
        var t = b.querySelector("svg"); b.childNodes[b.childNodes.length - 1].nodeValue = "Copied";
      }).catch(function () {});
    });
    var pb = o.querySelector('[data-act="poster"]');
    if (pb) pb.addEventListener("click", function () { sharePoster(opts.demand); });

    // setTimeout, not requestAnimationFrame: rAF is throttled to zero in a
    // backgrounded tab, which would leave the sheet stuck invisible.
    setTimeout(function () { o.classList.add("show"); }, 10);
  }

  // ---- toast (quieter repeat-share nudge) ---------------------------------

  var toastEl;
  function toast(msg, actionLabel, onAction) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.innerHTML = esc(msg) + (actionLabel ? ' <button>' + esc(actionLabel) + '</button>' : '');
    if (actionLabel) toastEl.querySelector("button").addEventListener("click", function () { onAction && onAction(); hideToast(); });
    toastEl.classList.add("show");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(hideToast, 4200);
  }
  function hideToast() { if (toastEl) toastEl.classList.remove("show"); }

  // ---- commitment-peak triggers -------------------------------------------

  // Fired right after a vote lands. First time in a session -> full sheet.
  // After that -> a quiet toast, so it never nags.
  function afterVote(demand) {
    var rank = demand.votes || 0;
    if (!sessionStorage.getItem("ca_shared")) {
      sessionStorage.setItem("ca_shared", "1");
      openSheet({
        eyebrow: "You're backer #" + fmt(rank),
        title: "You're in.",
        body: "This only wins if the next <b>three</b> people see it. Send it now, while you're here.",
        demand: demand,
      });
    } else {
      toast("Backed. ✓", "Share", function () { openSheet({ demand: demand }); });
    }
  }

  function afterPropose(demand) {
    openSheet({
      eyebrow: "It's on the list",
      title: "Now get it backed.",
      body: "You put this up. It rises when people vote for it. Send it to the people who'd sign.",
      demand: demand,
    });
  }

  function afterSend(demand) {
    if (sessionStorage.getItem("ca_sent")) return;
    sessionStorage.setItem("ca_sent", "1");
    openSheet({
      eyebrow: "Message ready to go",
      title: "You sent yours.",
      body: "One message is a letter. Ten thousand is a reckoning. Get three friends to send theirs.",
      demand: demand,
    });
  }

  return {
    shareText: shareText,
    waLink: waLink,
    xLink: xLink,
    openSheet: openSheet,
    sharePoster: sharePoster,
    posterSvg: posterSvg,
    toast: toast,
    afterVote: afterVote,
    afterPropose: afterPropose,
    afterSend: afterSend,
    SITE: SITE,
  };
})();
