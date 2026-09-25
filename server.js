const express = require("express");
const crypto = require("crypto");
const session = require("express-session");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// CORS — permite que o HaxBall acesse a API da Fúria
// ============================================================
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://html5.haxball.com",
    "https://www.haxball.com"
  ];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Furia-Secret"
  );
  res.header("Access-Control-Allow-Credentials", "true");

  // Responde imediatamente às requisições OPTIONS
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const PORT = process.env.PORT || 3000;

const PUBLIC_URL = (process.env.PUBLIC_URL || "")
  .replace(/\/$/, "");

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex");

const REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI ||
  `${PUBLIC_URL}/auth/discord/callback`;

// ============================================================
// SESSÃO
// ============================================================

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  }
}));

// ============================================================
// BANCO TEMPORÁRIO EM MEMÓRIA
// ============================================================

// token -> { auth, nick, expiresAt }
const pendingLinks = new Map();

// haxballAuth -> {
//   discordId,
//   discordName,
//   nick,
//   linkedAt,
//   wins,
//   losses
// }
const accounts = new Map();

// ============================================================
// LIMPEZA DE LINKS EXPIRADOS
// ============================================================

function cleanup() {
  const now = Date.now();

  for (const [token, data] of pendingLinks) {
    if (data.expiresAt < now) {
      pendingLinks.delete(token);
    }
  }
}

setInterval(cleanup, 60_000).unref();

// ============================================================
// VERIFICA CONFIGURAÇÃO
// ============================================================

function requireConfig() {
  if (!PUBLIC_URL || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Configure PUBLIC_URL, DISCORD_CLIENT_ID e DISCORD_CLIENT_SECRET."
    );
  }
}

// ============================================================
// PÁGINA INICIAL
// ============================================================

app.get("/", (req, res) => {
  res.send(`
    <html>
      <body style="
        font-family:Arial;
        background:#111;
        color:#fff;
        padding:40px
      ">
        <h1>Fúria — Login Discord</h1>

        <p>
          O sistema de vinculação Discord ↔ HaxBall está online.
        </p>
      </body>
    </html>
  `);
});

// ============================================================
// INICIAR LOGIN
// HaxBall chama isso quando o jogador usa !login
// ============================================================

app.post("/api/link/start", (req, res) => {
  const { auth, nick } = req.body || {};

  if (!auth || typeof auth !== "string") {
    return res.status(400).json({
      ok: false,
      error: "HaxBall auth ausente."
    });
  }

  const token = crypto
    .randomBytes(24)
    .toString("hex");

  pendingLinks.set(token, {
    auth,

    nick: String(nick || "")
      .slice(0, 50),

    expiresAt:
      Date.now() +
      10 * 60 * 1000
  });

  res.json({
    ok: true,

    url:
      `${PUBLIC_URL}/link/${token}`,

    expiresIn: 600
  });
});

// ============================================================
// PÁGINA DO LINK
// ============================================================

app.get("/link/:token", (req, res) => {
  const item =
    pendingLinks.get(req.params.token);

  if (!item || item.expiresAt < Date.now()) {
    return res.status(410).send(
      "Este link expirou. Volte à sala Fúria e use !login novamente."
    );
  }

  req.session.linkToken =
    req.params.token;

  try {
    requireConfig();
  } catch (e) {
    return res.status(500).send(
      e.message
    );
  }

  const params =
    new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: "identify"
    });

  res.send(`
    <html>

      <head>
        <title>Login Fúria</title>
      </head>

      <body style="
        font-family:Arial;
        background:#111;
        color:#fff;
        text-align:center;
        padding:60px
      ">

        <h1>🔥 Fúria</h1>

        <p>
          Você está vinculando o HaxBall
          <b>${escapeHtml(item.nick)}</b>
          ao Discord.
        </p>

        <a
          href="/auth/discord?${params.toString()}"
          style="
            display:inline-block;
            padding:14px 22px;
            background:#5865F2;
            color:#fff;
            text-decoration:none;
            border-radius:8px
          "
        >
          Entrar com Discord
        </a>

      </body>

    </html>
  `);
});

// ============================================================
// REDIRECIONAR PARA O DISCORD
// ============================================================

app.get("/auth/discord", (req, res) => {

  try {
    requireConfig();
  } catch (e) {
    return res.status(500).send(
      e.message
    );
  }

  if (!req.session.linkToken) {
    return res.status(400).send(
      "Sessão de vinculação ausente. Use !login novamente na sala."
    );
  }

  const params =
    new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: "identify"
    });

  res.redirect(
    `https://discord.com/oauth2/authorize?${params.toString()}`
  );
});

// ============================================================
// CALLBACK DO DISCORD
// ============================================================

app.get("/auth/discord/callback", async (req, res) => {

  try {

    requireConfig();

    const { code } = req.query;

    const token =
      req.session.linkToken;

    const link =
      pendingLinks.get(token);

    if (!code || !link) {
      return res.status(400).send(
        "Link inválido ou expirado."
      );
    }

    // --------------------------------------------------------
    // Troca o código OAuth pelo token do Discord
    // --------------------------------------------------------

    const tokenBody =
      new URLSearchParams({

        client_id:
          CLIENT_ID,

        client_secret:
          CLIENT_SECRET,

        grant_type:
          "authorization_code",

        code,

        redirect_uri:
          REDIRECT_URI
      });

    const tokenResponse =
      await fetch(
        "https://discord.com/api/oauth2/token",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded"
          },

          body:
            tokenBody
        }
      );

    if (!tokenResponse.ok) {
      throw new Error(
        "Discord recusou o código OAuth."
      );
    }

    const oauth =
      await tokenResponse.json();

    // --------------------------------------------------------
    // Busca o usuário Discord
    // --------------------------------------------------------

    const userResponse =
      await fetch(
        "https://discord.com/api/users/@me",
        {
          headers: {
            Authorization:
              `${oauth.token_type} ${oauth.access_token}`
          }
        }
      );

    if (!userResponse.ok) {
      throw new Error(
        "Não foi possível obter o usuário do Discord."
      );
    }

    const user =
      await userResponse.json();

    // --------------------------------------------------------
    // Preserva estatísticas existentes
    // --------------------------------------------------------

    const oldAccount =
      accounts.get(link.auth);

    accounts.set(link.auth, {

      discordId:
        user.id,

      discordName:
        user.global_name ||
        user.username,

      nick:
        link.nick,

      linkedAt:
        new Date().toISOString(),

      wins:
        oldAccount?.wins || 0,

      losses:
        oldAccount?.losses || 0
    });

    // --------------------------------------------------------
    // Finaliza o link
    // --------------------------------------------------------

    pendingLinks.delete(token);

    delete req.session.linkToken;

    res.send(`
      <html>

        <body style="
          font-family:Arial;
          background:#111;
          color:#fff;
          text-align:center;
          padding:60px
        ">

          <h1>✅ Conta vinculada!</h1>

          <p>
            Discord:
            <b>
              ${escapeHtml(
                user.global_name ||
                user.username
              )}
            </b>
          </p>

          <p>
            Você pode voltar para a sala Fúria.
          </p>

        </body>

      </html>
    `);

  } catch (err) {

    console.error(err);

    res.status(500).send(
      "Erro ao concluir o login. Tente !login novamente."
    );
  }
});

// ============================================================
// VERIFICAR STATUS DO JOGADOR
// HaxBall consulta quando o jogador entra
// ============================================================

app.get("/api/link/status", (req, res) => {

  const auth =
    String(req.query.auth || "");

  const account =
    accounts.get(auth);

  if (!account) {
    return res.json({
      linked: false
    });
  }

  const total =
    account.wins +
    account.losses;

  const winRate =
    total
      ? Math.round(
          account.wins /
          total *
          1000
        ) / 10
      : 0;

  res.json({

    linked: true,

    discordId:
      account.discordId,

    discordName:
      account.discordName,

    wins:
      account.wins,

    losses:
      account.losses,

    games:
      total,

    winRate
  });
});

// ============================================================
// REGISTRAR RESULTADO DA PARTIDA
// ============================================================

app.post("/api/stats/result", (req, res) => {

  const secret =
    req.get("x-furia-secret");

  if (
    !process.env.FURIA_API_SECRET ||
    secret !== process.env.FURIA_API_SECRET
  ) {

    return res.status(401).json({
      ok: false
    });
  }

  const {
    auths,
    winnerTeam
  } = req.body || {};

  if (
    !Array.isArray(auths) ||
    ![1, 2].includes(winnerTeam)
  ) {

    return res.status(400).json({
      ok: false
    });
  }

  for (const item of auths) {

    if (
      !item ||
      !item.auth
    ) {
      continue;
    }

    const account =
      accounts.get(item.auth);

    if (!account) {
      continue;
    }

    if (
      Number(item.team) ===
      winnerTeam
    ) {

      account.wins++;

    } else if (
      Number(item.team) === 1 ||
      Number(item.team) === 2
    ) {

      account.losses++;
    }
  }

  res.json({
    ok: true
  });
});

// ============================================================
// ESCAPAR HTML
// ============================================================

function escapeHtml(value) {

  return String(value)
    .replace(
      /[&<>"']/g,
      c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[c])
    );
}

// ============================================================
// INICIAR SERVIDOR
// ============================================================

app.listen(PORT, () => {

  console.log(
    `Fúria Discord Link online na porta ${PORT}`
  );

  console.log(
    `PUBLIC_URL: ${
      PUBLIC_URL ||
      "(não configurada)"
    }`
  );

});
