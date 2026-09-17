/* Wires the buy buttons to the Stripe Payment Link, and keeps the page honest
   when the link is not live yet: no button that pretends to work. */
(function () {
  var btns = [document.getElementById('buy-btn')].filter(Boolean);
  var note = document.getElementById('buy-note');

  fetch('config.json?' + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      if (cfg && cfg.payment_link) {
        btns.forEach(function (b) {
          b.setAttribute('href', cfg.payment_link);
          b.setAttribute('rel', 'noopener');
        });
        document.querySelectorAll('[data-track^="cta-pack"]').forEach(function (a) {
          a.setAttribute('href', '#buy');
        });
        if (note) note.textContent = 'Secure checkout by Stripe';
      } else {
        btns.forEach(function (b) {
          b.classList.add('ghost');
          b.textContent = 'Checkout opens shortly';
          b.setAttribute('href', 'https://github.com/humora2504/vibeproof');
          b.setAttribute('aria-disabled', 'true');
        });
        if (note) note.textContent = 'The scanner is free and ready now. Checkout is being connected.';
      }
    })
    .catch(function () { /* leave the page as served */ });

  // Carry the visit source through to checkout so a sale can be attributed.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-track^="buy"], a[data-track^="cta-pack"]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('buy.stripe.com') === -1) return;
    var q = new URLSearchParams(location.search);
    var src = q.get('utm_source') || q.get('src') || (document.referrer ? new URL(document.referrer).hostname : 'direct');
    var sep = href.indexOf('?') === -1 ? '?' : '&';
    a.setAttribute('href', href + sep + 'client_reference_id=' + encodeURIComponent(src.slice(0, 40)));
    if (window.vtTrack) window.vtTrack('checkout_start', { src: src });
  });
})();
