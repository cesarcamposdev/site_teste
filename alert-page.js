'use strict';
// Página-isca (/admin, /.env, ...): exibe o alerta assim que carrega.
(async () => {
  try {
    const r = await fetch('/api/alert-config', { credentials: 'same-origin' });
    const d = await r.json();
    if (d.alert) { Jumpscare.init(d.alert); Jumpscare.show(d.alert); }
  } catch { /* sem alerta */ }
})();
