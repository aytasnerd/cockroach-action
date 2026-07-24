// Turns a demand and a contact into one-tap share links.
// No tracking, no third-party SDKs. Plain wa.me, mailto, and intent links.

var CAActions = (function () {
  function messageFor(demand) {
    return (
      "Regarding: " + demand.title + "\n\n" +
      demand.text +
      "\n\nThis message is being sent by a member of the public asking your office to act on this. " +
      "Please treat it as a formal request and respond with the steps being taken.\n\nSent via Cockroach Action"
    );
  }

  function tweetFor(demand) {
    var base = demand.title + ". " + demand.text;
    var tag = "\n#CockroachAction";
    var max = 280 - tag.length;
    var body = base.length > max ? base.slice(0, max - 1) + "…" : base;
    return body + tag;
  }

  function whatsappLink(demand, phone) {
    var text = encodeURIComponent(messageFor(demand));
    return phone
      ? "https://wa.me/" + phone.replace(/[^\d]/g, "") + "?text=" + text
      : "https://wa.me/?text=" + text;
  }

  function mailtoLink(demand, email) {
    var subject = encodeURIComponent("Action requested: " + demand.title);
    var body = encodeURIComponent(messageFor(demand));
    return "mailto:" + (email || "") + "?subject=" + subject + "&body=" + body;
  }

  function tweetLink(demand) {
    return "https://twitter.com/intent/tweet?text=" + encodeURIComponent(tweetFor(demand));
  }

  return {
    messageFor: messageFor,
    tweetFor: tweetFor,
    whatsappLink: whatsappLink,
    mailtoLink: mailtoLink,
    tweetLink: tweetLink,
  };
})();
