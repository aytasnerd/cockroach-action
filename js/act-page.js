(function () {
  var demands = [];
  var rtiTemplate = null;

  function el(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  }

  function paramDemandId() {
    return new URLSearchParams(window.location.search).get("demand");
  }

  function buildPicker(selectedId) {
    var sel = el("demand-picker");
    sel.innerHTML = "";
    demands.forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.title;
      if (d.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function currentDemand() {
    var sel = el("demand-picker");
    return demands.find(function (d) { return d.id === sel.value; }) || demands[0];
  }

  function renderTemplates() {
    var demand = currentDemand();
    if (!demand) return;

    el("template-preview").textContent = CAActions.messageFor(demand);
    el("tweet-preview").textContent = CAActions.tweetFor(demand);

    var phone = el("target-phone").value.trim();
    var email = el("target-email").value.trim();

    el("wa-link").href = CAActions.whatsappLink(demand, phone);
    el("mail-link").href = CAActions.mailtoLink(demand, email);
    el("tweet-link").href = CAActions.tweetLink(demand);

    renderRti(demand);
  }

  // The RTI letter is a skeleton with tokens in it. Filling the demand in is
  // the whole point of generating it per demand - the old build rendered the
  // same generic text no matter which demand was picked.
  function renderRti(demand) {
    var preview = el("rti-preview");
    if (!rtiTemplate || !preview || !demand) return;
    preview.textContent = rtiTemplate.body
      .replace(/\{\{DEMAND_TITLE\}\}/g, demand.title)
      .replace(/\{\{DEMAND_TEXT\}\}/g, demand.text);
  }

  // Copy with a real fallback: the Clipboard API is unavailable in insecure
  // contexts and can be refused outright, and silently doing nothing is worse
  // than telling someone to copy it themselves.
  async function copyFrom(sourceId, feedbackId) {
    var text = el(sourceId).textContent;
    var fb = el(feedbackId);
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      fb.textContent = "Copied";
    } catch (e) {
      var node = el(sourceId);
      var range = document.createRange();
      range.selectNodeContents(node);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      fb.textContent = "Selected — press Copy";
    }
    fb.classList.add("show");
    setTimeout(function () { fb.classList.remove("show"); }, 2200);
  }

  function downloadText(text, filename) {
    var blob = new Blob([text], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Safari may not have started the transfer when click() returns; revoking
    // straight away cancels the download.
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  async function loadContacts() {
    var json = await CAStore.cachedJson("data/contacts.json", "ca_contacts_cache");
    if (!json) return;
    var sel = el("contact-picker");
    sel.innerHTML = '<option value="">Choose a saved contact (optional)</option>';
    (json.groups || []).forEach(function (g) {
      var group = document.createElement("optgroup");
      group.label = g.group;
      (g.contacts || []).forEach(function (c) {
        if (!c.email && !c.phone) return;
        var opt = document.createElement("option");
        opt.value = JSON.stringify({ email: c.email, phone: c.phone });
        opt.textContent = c.name;
        group.appendChild(opt);
      });
      if (group.children.length) sel.appendChild(group);
    });
    sel.addEventListener("change", function () {
      if (!sel.value) return;
      var c = JSON.parse(sel.value);
      el("target-email").value = c.email || "";
      el("target-phone").value = c.phone || "";
      renderTemplates();
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    demands = CAStore.getDemands();
    if (!demands.length) {
      try { demands = await CAStore.refresh(); } catch (e) { /* offline, nothing cached */ }
    }
    if (!demands.length) {
      var main = document.querySelector("main");
      if (main) main.insertAdjacentHTML("afterbegin",
        '<div class="empty">No demands saved on this phone yet. Open this page once with a connection.</div>');
      return;
    }

    buildPicker(paramDemandId());

    rtiTemplate = await CAStore.cachedJson("data/rti-template.json", "ca_rti_cache");
    if (rtiTemplate && el("rti-guidance")) {
      el("rti-guidance").innerHTML = (rtiTemplate.guidance || [])
        .map(function (g) { return "<li>" + escapeHtml(g) + "</li>"; })
        .join("");
    }

    renderTemplates();
    loadContacts();

    el("demand-picker").addEventListener("change", renderTemplates);
    el("target-phone").addEventListener("input", renderTemplates);
    el("target-email").addEventListener("input", renderTemplates);

    el("copy-message").addEventListener("click", function () {
      copyFrom("template-preview", "msg-copy-feedback");
    });

    if (el("copy-rti")) {
      el("copy-rti").addEventListener("click", function () {
        copyFrom("rti-preview", "rti-copy-feedback");
      });
    }

    if (el("download-rti")) {
      el("download-rti").addEventListener("click", function () {
        downloadText(el("rti-preview").textContent, "rti-application.txt");
      });
    }
  });

  // Refresh the picker if the list changes underneath us.
  document.addEventListener("ca:demands-changed", function () {
    var keep = el("demand-picker") && el("demand-picker").value;
    demands = CAStore.getDemands();
    if (demands.length && el("demand-picker")) {
      buildPicker(keep || paramDemandId());
      renderTemplates();
    }
  });
})();
