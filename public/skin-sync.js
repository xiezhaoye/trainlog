// Skin + unit preferences used to be device-local only (localStorage).
// They're now account-bound: the blocking bootstrap script in each page's
// <head> still applies localStorage's skin first (instant, no first-frame
// flicker), and this script then checks the account's stored values and
// corrects the page + local cache if another device changed them since.
(function () {
  'use strict';
  var SKEY = 'v2.skin';
  var UKEY = 'v2.unit';
  var THEME_COLORS = { athletic: '#18191b', heat: '#f7f7f5', fire: '#121214', fresh: '#f3f8f6', efficient: '#f4f6f9' };

  function applySkin(skin) {
    document.documentElement.setAttribute('data-skin', skin);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[skin] || THEME_COLORS.athletic);
  }

  fetch('/api/auth/session', { credentials: 'same-origin' }).then(function (r) {
    return r.json().catch(function () { return {}; });
  }).then(function (payload) {
    if (!payload || !payload.ok || !payload.user) return;
    var user = payload.user;

    if (user.skin && (THEME_COLORS.hasOwnProperty(user.skin) || user.skin === 'athletic')) {
      var localSkin = null;
      try { localSkin = localStorage.getItem(SKEY); } catch (e) {}
      if (user.skin !== localSkin) {
        try { localStorage.setItem(SKEY, user.skin); } catch (e) {}
        applySkin(user.skin);
        document.dispatchEvent(new CustomEvent('v2:skin-synced', { detail: user.skin }));
      }
    }

    if (user.unit === 'kg' || user.unit === 'lb') {
      var localUnit = null;
      try { localUnit = localStorage.getItem(UKEY); } catch (e) {}
      if (user.unit !== localUnit) {
        try { localStorage.setItem(UKEY, user.unit); } catch (e) {}
        document.dispatchEvent(new CustomEvent('v2:unit-synced', { detail: user.unit }));
      }
    }
  }).catch(function () {});
})();
