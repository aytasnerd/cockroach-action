(function () {
  var demands = [];
  var rtiTemplate = null;

  function el(id) { return document.getElementById(id); }
  function escapeHtml(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function paramDemandId() { return new URLSearchParams(window.location.search).get("demand"); }

  function buildPicker(selectedId) {
    var sel = el("demand-picker");
    sel.innerHTML = "";
    demands.forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d.id; opt.textContent = d.title;
      if (d.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function currentDemand() {
    var sel = el("demand-picker");
    return demands.find(function (d) { return d.id === sel.value; }) || demands[0];
  }

  function contactName() {
    var sel = el("contact-picker");
    var opt = sel.options[sel.selectedIndex];
    return (opt && opt.value) ? opt.textContent : null;
  }

  // Reset the editable draft from the chosen demand + recipient. Called when
  // the demand or recipient changes, not on every keystroke, so the sender's
  // own edits to the body survive while they tweak the phone or email.
  function resetDraft() {
    var d = currentDemand();
    if (d) el("template-preview").value = CAActions.draftFor(d, contactName());
    updateSendLinks();
  }

  function updateSendLinks() {
    var d = currentDemand();
    if (!d) return;
    var text = el("template-preview").value;
    var phone = el("target-phone").value.trim();
    var email = el("target-email").value.trim();
    el("wa-link").href = CAActions.whatsappLink(text, phone);
    el("mail-link").href = CAActions.mailtoLink(text, email, CAActions.subjectFor(d));
    el("tweet-preview").textContent = CAActions.tweetFor(d);
    el("tweet-link").href = CAActions.tweetLink(d);
  }

  function renderRti() {
    var d = currentDemand();
    if (!rtiTemplate || !d) return;
    el("rti-preview").value = rtiTemplate.body
      .replace(/\{\{DEMAND_TITLE\}\}/g, d.title)
      .replace(/\{\{DEMAND_TEXT\}\}/g, d.text);
  }

  async function copyFrom(sourceId, feedbackId) {
    var node = el(sourceId);
    var text = node.value !== undefined ? node.value : node.textContent;
    var fb = el(feedbackId);
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      fb.textContent = "Copied";
    } catch (e) {
      if (node.select) { node.focus(); node.select(); }
      fb.textContent = "Selected, press Copy";
    }
    fb.classList.add("show");
    setTimeout(function () { fb.classList.remove("show"); }, 2200);
  }

  function downloadText(text, filename) {
    var blob = new Blob([text], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  async function loadContacts() {
    var json = await CAStore.cachedJson("data/contacts.json", "ca_contacts_cache");
    var sel = el("contact-picker");
    sel.innerHTML = '<option value="">A general request</option>';
    if (json) {
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
    }
    // Add a link to the full MP finder, since only offices live here.
    var extra = document.createElement("optgroup");
    extra.label = "Your MP";
    var o = document.createElement("option");
    o.value = ""; o.textContent = "Find your MP on the Contacts page →"; o.disabled = true;
    extra.appendChild(o); sel.appendChild(extra);

    sel.addEventListener("change", function () {
      var opt = sel.options[sel.selectedIndex];
      if (opt && opt.value) {
        var c = JSON.parse(opt.value);
        el("target-email").value = c.email || "";
        el("target-phone").value = c.phone || "";
      }
      resetDraft();
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    demands = CAStore.getDemands();
    if (!demands.length) { try { demands = await CAStore.refresh(); } catch (e) {} }
    if (!demands.length) {
      var main = document.querySelector("main");
      if (main) main.insertAdjacentHTML("afterbegin", '<div class="empty">No demands saved yet. Open this page once with a connection.</div>');
      return;
    }

    buildPicker(paramDemandId());

    rtiTemplate = await CAStore.cachedJson("data/rti-template.json", "ca_rti_cache");
    if (rtiTemplate && el("rti-guidance")) {
      el("rti-guidance").innerHTML = (rtiTemplate.guidance || [])
        .map(function (g) { return "<li>" + escapeHtml(g) + "</li>"; }).join("");
    }

    await loadContacts();
    resetDraft();
    renderRti();

    el("demand-picker").addEventListener("change", function () { resetDraft(); renderRti(); });
    el("target-phone").addEventListener("input", updateSendLinks);
    el("target-email").addEventListener("input", updateSendLinks);
    el("template-preview").addEventListener("input", updateSendLinks);

    ["wa-link", "mail-link"].forEach(function (id) {
      var a = el(id);
      if (a) a.addEventListener("click", function () {
        if (window.CAShare) setTimeout(function () { CAShare.afterSend(currentDemand()); }, 500);
      });
    });

    el("copy-message").addEventListener("click", function () { copyFrom("template-preview", "msg-copy-feedback"); });
    if (el("copy-rti")) el("copy-rti").addEventListener("click", function () { copyFrom("rti-preview", "rti-copy-feedback"); });
    if (el("download-rti")) el("download-rti").addEventListener("click", function () { downloadText(el("rti-preview").value, "rti-application.txt"); });
  });

  document.addEventListener("ca:demands-changed", function () {
    var keep = el("demand-picker") && el("demand-picker").value;
    demands = CAStore.getDemands();
    if (demands.length && el("demand-picker")) { buildPicker(keep || paramDemandId()); updateSendLinks(); }
  });
})();
