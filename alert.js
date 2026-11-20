'use strict';
// Alerta visual/sonoro em tela cheia. Nenhum script inline (compatível com CSP estrito).
window.Jumpscare = (() => {
  let cfg = null, audio = null, unlocked = false, overlay = null;

  // Navegadores só liberam áudio após interação do usuário: "destravamos" o <audio>
  // no primeiro clique/tecla/toque (ex.: ao apertar "Entrar"), de forma silenciosa.
  function prime() {
    if (unlocked || !audio) return;
    audio.muted = true;
    const p = audio.play();
    if (p && p.then) {
      p.then(() => { audio.pause(); audio.currentTime = 0; audio.muted = false; unlocked = true; })
       .catch(() => { audio.muted = false; });
    }
  }

  function init(c) {
    if (!c || audio) return;
    cfg = c;
    audio = new Audio(c.audio);
    audio.preload = 'auto';
    audio.loop = true;
    new Image().src = c.image; // pré-carrega a imagem
    ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, prime, { passive: true }));
  }

  function playSound(label) {
    if (!audio) return;
    audio.muted = false;
    audio.volume = 1.0; // volume máximo do player (o volume do sistema é controlado pelo aparelho)
    audio.currentTime = 0;
    const p = audio.play();
    if (p && p.catch) {
      p.catch(() => {
        label.textContent += ' (toque na tela para ativar o som)';
        overlay.addEventListener('click', () => { audio.play().catch(() => {}); }, { once: true });
      });
    }
  }

  function onKey(e) { if (e.key === 'Escape') hide(); }

  function hide() {
    if (!overlay) return;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onKey);
  }

  function show(p) {
    if (overlay || !p) return;
    if (!audio) init(p);
    overlay = document.createElement('div');
    overlay.className = 'jumpscare-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-label', 'Alerta de segurança');

    const img = document.createElement('img');
    img.src = p.image || (cfg && cfg.image);
    img.alt = 'Alerta de segurança';

    const label = document.createElement('p');
    label.className = 'jumpscare-label';
    label.textContent = '⚠ Atividade suspeita detectada. IP e tentativa registrados.';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'jumpscare-close';
    close.textContent = 'Fechar (Esc)';
    close.addEventListener('click', hide);

    overlay.append(img, label, close);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey);
    try { if (overlay.requestFullscreen) overlay.requestFullscreen().catch(() => {}); } catch { /* ignora */ }
    playSound(label);
  }

  return { init, show, hide };
})();
