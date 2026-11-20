'use strict';
(() => {
  let csrf = '';
  const $ = (id) => document.getElementById(id);
  const msg = $('msg');

  const say = (t, ok = false) => {
    if (!t) {
      msg.textContent = '';
      msg.className = '';
      return;
    }
    msg.textContent = t;
    msg.className = ok ? 'msg-box ok' : 'msg-box err';
  };

  async function loadCsrf() {
    const r = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json();
    csrf = d.csrf;
    Jumpscare.init(d.alert);
  }

  async function post(path, body, retry = true) {
    const r = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 403 && data.code === 'CSRF' && retry) {
      await loadCsrf();
      return post(path, body, false);
    }
    if (data.csrf) csrf = data.csrf;
    if (data.alert) Jumpscare.show(data.alert);
    return { status: r.status, data };
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    say('');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    try {
      const { status, data } = await post('/api/login', formData(e.target));
      if (status === 200) {
        location.href = '/dashboard';
        return;
      }
      say(data.error || 'Erro ao entrar.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar na plataforma';
    }
  });

  $('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    say('');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Criando conta...';
    try {
      const { status, data } = await post('/api/register', formData(e.target));
      if (status === 201) {
        say('Conta criada! Redirecionando para o painel...', true);
        setTimeout(() => { location.href = '/dashboard'; }, 500);
        return;
      }
      say(data.error || 'Erro ao cadastrar.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Criar conta e entrar';
    }
  });

  function showTab(which) {
    const isLogin = which === 'login';
    $('login-form').hidden = !isLogin;
    $('register-form').hidden = isLogin;
    $('tab-login').classList.toggle('active', isLogin);
    $('tab-register').classList.toggle('active', !isLogin);
    $('tab-login').setAttribute('aria-selected', String(isLogin));
    $('tab-register').setAttribute('aria-selected', String(!isLogin));
    $('form-title').textContent = isLogin ? 'Bem-vindo de volta' : 'Crie sua conta';
    $('form-subtitle').textContent = isLogin
      ? 'Entre com qualquer usuário e senha para acessar o painel.'
      : 'Cadastre qualquer usuário e senha em segundos.';
    say('');
  }

  $('tab-login').addEventListener('click', () => showTab('login'));
  $('tab-register').addEventListener('click', () => showTab('register'));

  // Alternar visualização de senha
  document.querySelectorAll('.toggle-pass').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.target);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Ocultar' : 'Mostrar';
    });
  });

  loadCsrf().catch(() => say('Falha ao iniciar sessão segura.'));
})();
