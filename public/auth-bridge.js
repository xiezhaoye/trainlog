/*
 * Authentication behavior for the frozen design pages.
 * The login/signup HTML files remain unedited; the Worker injects this script
 * only on their public routes so UI source and visual layout stay intact.
 */
(function () {
  'use strict';

  function api(path, data) {
    return fetch(path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(data || {})
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok || payload.ok === false) throw new Error(payload.error || '请求失败，请重试');
        return payload;
      });
    });
  }

  function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value); }
  var turnstileScript;
  function loadTurnstile() {
    if (!window.TRAINLOG_TURNSTILE_SITE_KEY) return Promise.resolve(null);
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileScript) return turnstileScript;
    turnstileScript = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true; script.defer = true;
      script.onload = function () { window.turnstile ? resolve(window.turnstile) : reject(new Error('人机验证未能加载')); };
      script.onerror = function () { reject(new Error('人机验证未能加载，请检查网络后重试')); };
      document.head.appendChild(script);
    });
    return turnstileScript;
  }
  function turnstileToken() {
    var siteKey = window.TRAINLOG_TURNSTILE_SITE_KEY;
    if (!siteKey) return Promise.resolve(''); // Local development bypasses server-side verification.
    return loadTurnstile().then(function (challenge) {
      return new Promise(function (resolve, reject) {
        // Cloudflare warns that even an "invisible" widget can fall back to an
        // interactive challenge for some requests; hiding this off-screen would
        // leave that challenge unreachable and the request would hang until it
        // times out, so the container stays on-screen (just visually minimal).
        var mount = document.createElement('div');
        mount.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;';
        document.body.appendChild(mount);
        var completed = false;
        function cleanup() { if (mount.parentNode) mount.parentNode.removeChild(mount); }
        var widgetId = challenge.render(mount, {
          sitekey: siteKey,
          appearance: 'execute',
          callback: function (token) { if (!completed) { completed = true; cleanup(); resolve(token); } },
          'error-callback': function () { if (!completed) { completed = true; cleanup(); reject(new Error('人机验证失败，请重试')); } },
          'expired-callback': function () { if (!completed) { completed = true; cleanup(); reject(new Error('人机验证已过期，请重试')); } }
        });
        challenge.execute(widgetId);
      });
    });
  }
  function showDevCode(payload, input) {
    if (payload && payload.devCode) {
      console.info('[TrainLog local development] verification code:', payload.devCode);
      input.value = payload.devCode;
    }
  }
  function countdown(button) {
    var seconds = 60;
    button.disabled = true;
    button.textContent = '已发送 · ' + seconds + 's';
    var timer = setInterval(function () {
      seconds -= 1;
      if (seconds <= 0) { clearInterval(timer); button.disabled = false; button.textContent = '重新发送'; }
      else button.textContent = '已发送 · ' + seconds + 's';
    }, 1000);
  }

  function setupSignup() {
    var form = document.getElementById('signupForm');
    if (!form) return;
    var email = document.getElementById('email');
    var code = document.getElementById('code');
    var password = document.getElementById('password');
    var send = document.getElementById('sendCode');
    var error = document.getElementById('err');
    var done = document.getElementById('done');
    var hint = document.getElementById('codeHint');
    var submit = document.getElementById('submit');

    send.addEventListener('click', function (event) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!validEmail(email.value)) { error.textContent = '请输入有效的邮箱地址'; email.focus(); return; }
      error.textContent = ''; send.disabled = true;
      turnstileToken().then(function (token) {
        return api('/api/auth/signup/send-code', { email: email.value, turnstileToken: token });
      }).then(function (payload) {
        hint.style.display = 'block'; countdown(send); showDevCode(payload, code);
      }).catch(function (reason) { send.disabled = false; error.textContent = reason.message; });
    }, true);

    form.addEventListener('submit', function (event) {
      event.preventDefault(); event.stopImmediatePropagation(); error.textContent = '';
      if (!validEmail(email.value)) { error.textContent = '请输入有效的邮箱地址'; email.focus(); return; }
      if (code.value.length < 6) { error.textContent = '请先获取并输入 6 位邮箱验证码'; return; }
      if (password.value.length < 4) { error.textContent = '登录密码至少 4 个字符'; password.focus(); return; }
      submit.disabled = true;
      api('/api/auth/signup', { email: email.value, code: code.value, password: password.value }).then(function () {
        done.style.display = 'block'; done.textContent = '注册成功 · 开始记录训练 →';
        window.location.assign('/app');
      }).catch(function (reason) { submit.disabled = false; error.textContent = reason.message; });
    }, true);
  }

  function setupLogin() {
    var form = document.getElementById('loginForm');
    if (!form) return;
    var email = document.getElementById('email');
    var password = document.getElementById('password');
    var code = document.getElementById('code');
    var send = document.getElementById('sendCode');
    var error = document.getElementById('err');
    var done = document.getElementById('done');
    var submit = document.getElementById('submit');
    var remember = document.getElementById('rememberMe');
    var mode = function () { return document.querySelector('[data-mode="code"]').classList.contains('is-active') ? 'code' : 'password'; };

    send.addEventListener('click', function (event) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!validEmail(email.value)) { error.textContent = '请输入有效的邮箱地址'; email.focus(); return; }
      error.textContent = ''; send.disabled = true;
      turnstileToken().then(function (token) {
        return api('/api/auth/login/send-code', { email: email.value, turnstileToken: token });
      }).then(function (payload) {
        countdown(send); showDevCode(payload, code);
      }).catch(function (reason) { send.disabled = false; error.textContent = reason.message; });
    }, true);

    form.addEventListener('submit', function (event) {
      event.preventDefault(); event.stopImmediatePropagation(); error.textContent = '';
      if (!validEmail(email.value)) { error.textContent = '请输入有效的邮箱地址'; email.focus(); return; }
      var payload = { email: email.value, remember: Boolean(remember.checked) };
      var endpoint;
      if (mode() === 'password') {
        if (!password.value) { error.textContent = '请输入登录密码'; password.focus(); return; }
        endpoint = '/api/auth/login/password'; payload.password = password.value;
      } else {
        if (code.value.length < 6) { error.textContent = '请输入 6 位验证码'; code.focus(); return; }
        endpoint = '/api/auth/login/code'; payload.code = code.value;
      }
      submit.disabled = true;
      api(endpoint, payload).then(function () {
        done.style.display = 'block'; done.textContent = '登录成功 · 开始记录训练 →';
        window.location.assign('/app');
      }).catch(function (reason) { submit.disabled = false; error.textContent = reason.message; });
    }, true);
  }

  setupSignup();
  setupLogin();
})();
