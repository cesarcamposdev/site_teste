'use strict';
(async () => {
  const $ = (id) => document.getElementById(id);
  let csrf = '';
  let alertCfg = null;

  const SUSPICIOUS_TYPES = new Set([
    'suspicious_payload',
    'honeypot_field_filled',
    'honeytoken_login',
    'honeytoken_register',
    'honeypot_route',
    'brute_force',
    'rate_limit_auth',
  ]);

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso || '';
    }
  }

  async function loadEvents() {
    const ev = await (await fetch('/api/events', { credentials: 'same-origin', cache: 'no-store' })).json();
    const list = ev.events || [];
    const tbody = $('events');
    tbody.textContent = '';

    let alertCount = 0;
    for (const e of list) {
      if (SUSPICIOUS_TYPES.has(e.type)) alertCount++;

      const tr = document.createElement('tr');

      const tdTs = document.createElement('td');
      tdTs.textContent = formatDate(e.ts);
      tr.appendChild(tdTs);

      const tdIp = document.createElement('td');
      const codeIp = document.createElement('code');
      codeIp.textContent = e.ip ?? '';
      tdIp.appendChild(codeIp);
      tr.appendChild(tdIp);

      const tdType = document.createElement('td');
      const badge = document.createElement('span');
      const isAlert = SUSPICIOUS_TYPES.has(e.type);
      badge.className = isAlert ? 'event-badge danger' : 'event-badge normal';
      badge.textContent = e.type ?? '';
      tdType.appendChild(badge);
      tr.appendChild(tdType);

      const tdPath = document.createElement('td');
      tdPath.textContent = e.path ?? '';
      tr.appendChild(tdPath);

      const tdUser = document.createElement('td');
      tdUser.textContent = e.username || '—';
      tr.appendChild(tdUser);

      tbody.appendChild(tr);
    }

    $('stat-total').textContent = String(list.length);
    $('stat-alerts').textContent = String(alertCount);
  }

  try {
    const c = await (await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' })).json();
    csrf = c.csrf;
    alertCfg = c.alert;
    Jumpscare.init(alertCfg);

    const me = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
    if (me.status === 401) {
      location.href = '/';
      return;
    }
    const user = await me.json();
    const uname = user.username || 'Usuário';
    $('who').textContent = uname;
    $('avatar-letter').textContent = uname.charAt(0).toUpperCase();

    await loadEvents();
  } catch {
    location.href = '/';
    return;
  }

  $('refresh-events').addEventListener('click', () => {
    loadEvents().catch(() => {});
  });

  $('test-alert').addEventListener('click', () => {
    if (alertCfg) Jumpscare.show({ ...alertCfg, reason: 'test' });
  });

  $('logout').addEventListener('click', async () => {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: '{}',
    });
    location.href = '/';
  });
})();
