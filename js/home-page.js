(function () {
  // Rotating agitprop kicker. Changes every load, so the page never feels
  // static, and it seeds a rotating bank of protest + search phrases. The
  // static <h1>, <title> and meta carry the real SEO weight; this is spice.
  var KICKERS = [
    "The paper leaked. The people didn't.",
    "NTA exam leak. Nobody forgets.",
    "Re-exam. Answers. Accountability.",
    "One leak. A whole generation cheated.",
    "They hoped we'd move on. We didn't.",
    "Every vote is a name they can't ignore.",
    "Students remember. Make them answer.",
    "Paper-leak protest, one tap at a time.",
    "No leader to arrest. No account to ban.",
    "RTI. Re-exam. Resignations.",
    "The exam was rigged. The demand isn't.",
    "Cut the power. The list survives.",
  ];

  function paintKicker() {
    var k = document.getElementById("kicker");
    if (k) k.textContent = KICKERS[Math.floor(Math.random() * KICKERS.length)];
  }

  function paintStats() {
    var list = CAStore.getDemands();
    if (!list.length) return; // keep the seeded floor already in the HTML
    var votes = list.reduce(function (sum, d) { return sum + (d.votes || 0); }, 0);
    document.getElementById("stat-demands").textContent = list.length;
    document.getElementById("stat-votes").textContent = votes.toLocaleString("en-IN");
  }

  function total() {
    return CAStore.getDemands().reduce(function (s, d) { return s + (d.votes || 0); }, 0);
  }

  function wireShare() {
    var openGeneral = function () {
      if (window.CAShare) CAShare.openSheet({
        total: total(),
        eyebrow: "Pass it on",
        title: "Send it to three people",
        body: "This only works because it spreads. One forward can reach a whole group.",
      });
    };
    ["share-wa", "share-x", "share-copy"].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.addEventListener("click", function (e) { e.preventDefault(); openGeneral(); });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    paintKicker();
    wireShare();
    paintStats();
    CAStore.refresh().then(paintStats).catch(function () {});
  });

  document.addEventListener("ca:demands-changed", paintStats);
})();
