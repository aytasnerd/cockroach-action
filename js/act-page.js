(function () {
  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function paramDemandId() {
    var params = new URLSearchParams(window.location.search);
    return params.get("demand");
  }

  function buildPicker(demands, selectedId) {
    var sel = document.getElementById("demand-picker");
    sel.innerHTML = "";
    demands.forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.title;
      if (d.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function renderTemplates(demand) {
    document.getElementById("template-preview").textContent = CAActions.messageFor(demand);
    document.getElementById("tweet-preview").textContent = CAActions.tweetFor(demand);

    var phone = document.getElementById("target-phone").value.trim();
    var email = document.getElementById("target-email").value.trim();

    document.getElementById("wa-link").href = CAActions.whatsappLink(demand, phone);
    document.getElementById("mail-link").href = CAActions.mailtoLink(demand, email);
    document.getElementById("tweet-link").href = CAActions.tweetLink(demand);
  }

  function currentDemand(demands) {
    var sel = document.getElementById("demand-picker");
    return demands.find(function (d) { return d.id === sel.value; }) || demands[0];
  }

  async function loadContacts() {
    try {
      var json = await CAStore.cachedJsonFetch("data/contacts.json", "ca_contacts_cache");
      if (!json) throw new Error("no cached copy yet");
      var sel = document.getElementById("contact-picker");
      sel.innerHTML = '<option value="">Choose a saved contact (optional)</option>';
      json.groups.forEach(function (g) {
        var group = document.createElement("optgroup");
        group.label = g.group;
        g.contacts.forEach(function (c) {
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
        document.getElementById("target-email").value = c.email || "";
        document.getElementById("target-phone").value = c.phone || "";
        renderTemplates(currentDemand(CAStore.getDemands()));
      });
    } catch (e) {
      // offline with no cached copy yet. Contact picker just stays empty, manual entry still works.
    }
  }

  function renderRti(demand, template) {
    var body = template.body;
    document.getElementById("rti-preview").textContent = body;
  }

  async function loadRtiTemplate() {
    return await CAStore.cachedJsonFetch("data/rti-template.json", "ca_rti_cache");
  }

  document.addEventListener("DOMContentLoaded", async function () {
    await CAStore.ensureSeeded();
    var demands = CAStore.getDemands();
    if (!demands.length) return;

    buildPicker(demands, paramDemandId());
    renderTemplates(currentDemand(demands));
    loadContacts();

    document.getElementById("demand-picker").addEventListener("change", function () {
      renderTemplates(currentDemand(demands));
    });
    document.getElementById("target-phone").addEventListener("input", function () {
      renderTemplates(currentDemand(demands));
    });
    document.getElementById("target-email").addEventListener("input", function () {
      renderTemplates(currentDemand(demands));
    });

    var rtiTemplate = await loadRtiTemplate();
    if (rtiTemplate) {
      document.getElementById("rti-guidance").innerHTML = rtiTemplate.guidance
        .map(function (g) { return "<li>" + escapeHtml(g) + "</li>"; })
        .join("");
      var renderRtiNow = function () { renderRti(currentDemand(demands), rtiTemplate); };
      renderRtiNow();
      document.getElementById("demand-picker").addEventListener("change", renderRtiNow);

      document.getElementById("copy-rti").addEventListener("click", function () {
        navigator.clipboard.writeText(document.getElementById("rti-preview").textContent).then(function () {
          var fb = document.getElementById("rti-copy-feedback");
          fb.classList.add("show");
          setTimeout(function () { fb.classList.remove("show"); }, 1800);
        });
      });

      document.getElementById("download-rti").addEventListener("click", function () {
        var blob = new Blob([document.getElementById("rti-preview").textContent], { type: "text/plain" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "rti-application.txt";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }

    document.getElementById("copy-message").addEventListener("click", function () {
      navigator.clipboard.writeText(document.getElementById("template-preview").textContent).then(function () {
        var fb = document.getElementById("msg-copy-feedback");
        fb.classList.add("show");
        setTimeout(function () { fb.classList.remove("show"); }, 1800);
      });
    });
  });
})();
