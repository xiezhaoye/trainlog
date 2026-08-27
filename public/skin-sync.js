// Skin preference used to be device-local only (localStorage). It's now
// account-bound: the blocking bootstrap script in each page's <head> still
// applies whatever's in localStorage first (instant, no first-frame flicker),
// and this script then checks the account's stored skin and corrects the
// page + local cache if another device changed it since.
(function () {
  'use strict';
  var SKEY = 'v2.skin';
  var THEME_COLORS = { athletic: '#18191b', heat: '#f7f7f5', fire: '#121214', fresh: '#f3f8f6', efficient: '#f4f6f9' };

  function applySkin(skin) {
    document.documentElement.setAttribute('data-skin', skin);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[skin] || THEME_COLORS.athletic);
  }

  fetch('/api/auth/session', { credentials: 'same-origin' }).then(function (r) {
    return r.json().catch(function () { return {}; });
  }).then(function (payload) {
    if (!payload || !payload.ok || !payload.user || !payload.user.skin) return;
    var serverSkin = payload.user.skin;
    if (!THEME_COLORS.hasOwnProperty(serverSkin) && serverSkin !== 'athletic') return;
    var local = null;
    try { local = localStorage.getItem(SKEY); } catch (e) {}
    if (serverSkin === local) return;
    try { localStorage.setItem(SKEY, serverSkin); } catch (e) {}
    applySkin(serverSkin);
    document.dispatchEvent(new CustomEvent('v2:skin-synced', { detail: serverSkin }));
  }).catch(function () {});
})();
