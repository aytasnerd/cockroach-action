// Turns text + a contact into one-tap send links.
// No tracking, no third-party SDKs. Plain wa.me, mailto, and intent links.
//
// Everything here works from an editable message string, not a fixed template,
// so the person can change a word before it opens in their own app. The demand
// helpers below just produce a sensible starting draft.

var CAActions = (function () {
  // A draft the sender is meant to edit. The bracketed lines are prompts they
  // fill in or delete - leaving a way to be reached is optional on purpose.
  function draftFor(demand, toName) {
    var to = toName ? "To " + toName + ",\n\n" : "";
    return (
      to +
      "I am writing as a member of the public about the following demand:\n\n" +
      demand.title + "\n" + demand.text + "\n\n" +
      "I am asking your office to act on this and to tell me what steps are being taken. " +
      "Please treat this as a formal request for a response.\n\n" +
      "[Your name - optional]\n" +
      "[Your city - optional]\n" +
      "[A phone or email to reach you - optional]"
    );
  }

  function subjectFor(demand) {
    return "Action requested: " + demand.title;
  }

  function tweetFor(demand) {
    var base = demand.title + ". " + demand.text;
    var tag = "\n#CockroachAction";
    var max = 280 - tag.length;
    var body = base.length > max ? base.slice(0, max - 1) + "…" : base;
    return body + tag;
  }

  function digits(phone) { return (phone || "").replace(/[^\d]/g, ""); }

  // wa.me wants a full international number with no plus. Indian mobiles are
  // stored as 10 digits, so prepend 91 when it looks like one.
  function waNumber(phone) {
    var d = digits(phone);
    if (d.length === 10) return "91" + d;
    return d;
  }

  function whatsappLink(text, phone) {
    var t = encodeURIComponent(text);
    var n = waNumber(phone);
    return n ? "https://wa.me/" + n + "?text=" + t : "https://wa.me/?text=" + t;
  }

  function mailtoLink(text, email, subject) {
    var s = encodeURIComponent(subject || "");
    var b = encodeURIComponent(text);
    return "mailto:" + (email || "") + "?subject=" + s + "&body=" + b;
  }

  function tweetLink(demand) {
    return "https://twitter.com/intent/tweet?text=" + encodeURIComponent(tweetFor(demand));
  }

  return {
    draftFor: draftFor,
    subjectFor: subjectFor,
    tweetFor: tweetFor,
    whatsappLink: whatsappLink,
    mailtoLink: mailtoLink,
    tweetLink: tweetLink,
    waNumber: waNumber,
  };
})();
