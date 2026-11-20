# Site seguro local (login + banco + cyber-decepção)

Projeto para **estudo e teste defensivo em ambiente local**. Não exponha à internet sem revisão.

## Estrutura
```
site-seguro/
├── server.js            # Express: headers, CSP, rate limit, CSRF, honeypots
├── package.json
├── .env.example         # copie para .env
├── src/
│   ├── config.js        # variáveis de ambiente validadas
│   ├── db.js            # SQLite (tabelas)
│   ├── auth.js          # registro, login, logout, bloqueio progressivo
│   ├── sessions.js      # sessões (só o hash do token vai ao banco)
│   ├── detect.js        # detecção de payloads suspeitos
│   └── audit.js         # logs auditáveis (arquivo + banco)
├── public/              # arquivos estáticos
│   ├── index.html, css/style.css
│   ├── js/ (app.js, alert.js, alert-page.js, dashboard.js)
│   └── assets/          # <- jumpscare.jpg e som_jumpscare_max_volume.mp3
├── views/               # dashboard.html (só logado) e alert.html (isca)
├── data/                # app.db (criado automaticamente)
└── logs/                # audit.log (JSON por linha)
```

## Como rodar
1. Instale o Node.js 18+ (nodejs.org).
2. Na pasta do projeto: `npm install`
3. `cp .env.example .env` (Windows: `copy .env.example .env`) e preencha `PEPPER`:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
4. Coloque `jumpscare.jpg` e `som_jumpscare_max_volume.mp3` em `public/assets/`
   (para trocar, mude `JUMPSCARE_IMAGE` / `JUMPSCARE_AUDIO` no `.env`).
5. `npm start` e abra `http://localhost:3000`.
   Safari: use `COOKIE_SECURE=false` no `.env`.

## Como testar a detecção
- Erre a senha 5 vezes (`BRUTE_ALERT_AFTER`) → alerta + bloqueio progressivo.
- Tente entrar com o usuário `admin` (conta-isca) → alerta imediato.
- Digite `' OR 1=1 --` no usuário → alerta (payload suspeito).
- Acesse `http://localhost:3000/admin` ou `/.env` → página-isca com alerta.
- No painel, o botão "Testar alerta" mostra a imagem e toca o som.
- Eventos: painel e `logs/audit.log`.

## Mecanismos de segurança
- **Argon2id + pepper**: hash lento e resistente a GPU; o pepper (no .env) protege se o banco vazar.
- **Queries parametrizadas**: o SQL nunca é montado por concatenação (anti SQLi).
- **CSRF rotativo**: token ligado à sessão, comparado em tempo constante, trocado a cada POST válido; também valida `Origin` e `Content-Type`.
- **CSP estrito**: `default-src 'none'`, scripts/estilos só de `'self'`, sem inline (por isso não há JS/CSS inline no projeto).
- **Cookies**: HttpOnly, Secure, SameSite=Strict, prefixo `__Host-`; sessão nova no login (anti fixation); expira por inatividade (30 min) e tempo total (8 h).
- **Rate limiting**: 120 req/min global e 20 tentativas/15 min em login/cadastro.
- **Bloqueio progressivo**: a partir de 3 falhas, 30 s, 60 s, 120 s... até 15 min, por IP e por usuário (existindo ou não, sem vazar quais contas existem).
- **Anti-enumeração**: mensagem genérica e tempo igualado com hash descartável.
- **Headers**: via Helmet (nosniff, COOP/CORP, Referrer-Policy, frame-ancestors none) + Permissions-Policy; checagem do header Host (anti DNS rebinding); sem `X-Powered-By`; erros sem stack trace.
- **Logs auditáveis**: IP, rota, user-agent, tipo e detalhe, JSON por linha; caracteres de controle removidos (anti log injection).
- **Cyber-decepção**: conta-isca (honeytoken), campo oculto de formulário, rotas-isca e detecção de padrões de SQLi/XSS/traversal/comando. Tudo é registrado e dispara o alerta.
- **Variáveis de ambiente**: segredos só no `.env` (ignorado pelo git).

## Limites que vale conhecer
- O alerta só aparece para quem usa o **navegador** (curl/scripts não veem nada). A detecção e o log funcionam sempre.
- Navegadores só tocam áudio após interação do usuário; o código "destrava" o som no primeiro clique/toque. O volume máximo é o do player: o volume do sistema é do aparelho.
- A tela cheia pode ser recusada pelo navegador; o alerta cobre a janela de qualquer forma. Há botão "Fechar" e a tecla Esc.
- A detecção por padrões gera falsos positivos e não substitui um WAF.
- Imagem e som assustadores podem causar mal-estar (fotossensibilidade, sustos): use só em ambiente próprio e avise quem for testar.

[clique aqui para acessar o site]

https://cesarcamposdev.github.io/site_teste/
