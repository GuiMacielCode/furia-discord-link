const express = require("express");
const crypto = require("crypto");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// CORS
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

  res.header(
    "Access-Control-Allow-Credentials",
    "true"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const PORT = process.env.PORT || 3000;

const PUBLIC_URL =
  (process.env.PUBLIC_URL || "").replace(/\/$/, "");

const CLIENT_ID =
  process.env.DISCORD_CLIENT_ID;

const CLIENT_SECRET =
  process.env.DISCORD_CLIENT_SECRET;

const DISCORD_BOT_TOKEN =
  process.env.DISCORD_BOT_TOKEN;

const DISCORD_GUILD_ID =
  process.env.DISCORD_GUILD_ID;

const DISCORD_ROLE_ID =
  process.env.DISCORD_ROLE_ID;

const REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI ||
  PUBLIC_URL + "/auth/discord/callback";

// ============================================================
// BANCO TEMPORÁRIO EM MEMÓRIA
// ============================================================

// token -> { auth, nick, expiresAt }
const pendingLinks = new Map();

// haxballAuth -> conta Discord
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
// VERIFICAR CONFIGURAÇÃO
// ============================================================

function requireConfig() {

  if (
    !PUBLIC_URL ||
    !CLIENT_ID ||
    !CLIENT_SECRET
  ) {
    throw new Error(
      "Configure PUBLIC_URL, DISCORD_CLIENT_ID e DISCORD_CLIENT_SECRET."
    );
  }

  if (
    !DISCORD_BOT_TOKEN ||
    !DISCORD_GUILD_ID ||
    !DISCORD_ROLE_ID
  ) {
    throw new Error(
      "Configure DISCORD_BOT_TOKEN, DISCORD_GUILD_ID e DISCORD_ROLE_ID."
    );
  }
}

// ============================================================
// PÁGINA INICIAL
// ============================================================

app.get("/", (req, res) => {

  res.send(`
    <html>

      <head>
        <title>Fúria Discord Link</title>
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
          Sistema de vinculação Discord ↔ HaxBall online.
        </p>

      </body>

    </html>
  `);
});

// ============================================================
// INICIAR LOGIN
// HaxBall chama isso através do !login
// ============================================================

app.post("/api/link/start", (req, res) => {

  try {

    requireConfig();

    const {
      auth,
      nick
    } = req.body || {};

    if (
      !auth ||
      typeof auth !== "string"
    ) {

      return res.status(400).json({
        ok: false,
        error: "HaxBall auth ausente."
      });
    }

    const token =
      crypto
        .randomBytes(24)
        .toString("hex");

    pendingLinks.set(token, {

      auth,

      nick:
        String(nick || "")
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

  } catch (err) {

    console.error(err);

    res.status(500).json({

      ok: false,

      error:
        "Erro interno do servidor."

    });
  }
});

// ============================================================
// PÁGINA DO LINK
// ============================================================

app.get("/link/:token", (req, res) => {

  try {

    requireConfig();

    const token =
      req.params.token;

    const item =
      pendingLinks.get(token);

    if (
      !item ||
      item.expiresAt < Date.now()
    ) {

      return res.status(410).send(`

        <html>

          <body style="
            font-family:Arial;
            background:#111;
            color:#fff;
            text-align:center;
            padding:60px
          ">

            <h1>❌ Link expirado</h1>

            <p>
              Volte para a sala Fúria
              e use <b>!login</b> novamente.
            </p>

          </body>

        </html>

      `);
    }

    // ========================================================
    // O TOKEN VAI NO STATE
    // ========================================================

    const params =
      new URLSearchParams({

        client_id:
          CLIENT_ID,

        response_type:
          "code",

        redirect_uri:
          REDIRECT_URI,

        // IMPORTANTE:
        // guilds.join permite adicionar
        // o usuário ao servidor.

        scope:
          "identify guilds.join",

        state:
          token

      });

    const discordUrl =
      `https://discord.com/oauth2/authorize?${params.toString()}`;

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
            href="${escapeHtml(discordUrl)}"
            style="
              display:inline-block;
              padding:14px 22px;
              background:#5865F2;
              color:#fff;
              text-decoration:none;
              border-radius:8px;
              font-weight:bold
            "
          >
            Entrar com Discord
          </a>

          <p style="
            margin-top:30px;
            color:#aaa;
            font-size:14px
          ">
            Este link expira em 10 minutos.
          </p>

        </body>

      </html>

    `);

  } catch (err) {

    console.error(err);

    res.status(500).send(
      "Erro interno do servidor."
    );
  }
});

// ============================================================
// REDIRECIONAR PARA DISCORD
// ============================================================

app.get("/auth/discord", (req, res) => {

  try {

    requireConfig();

    const token =
      String(req.query.state || "");

    if (!token) {

      return res.status(400).send(
        "Token de vinculação ausente. Use !login novamente na sala."
      );
    }

    const link =
      pendingLinks.get(token);

    if (
      !link ||
      link.expiresAt < Date.now()
    ) {

      return res.status(410).send(
        "Link inválido ou expirado. Use !login novamente na sala."
      );
    }

    const params =
      new URLSearchParams({

        client_id:
          CLIENT_ID,

        response_type:
          "code",

        redirect_uri:
          REDIRECT_URI,

        scope:
          "identify guilds.join",

        state:
          token

      });

    res.redirect(
      `https://discord.com/oauth2/authorize?${params.toString()}`
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(
      "Erro interno do servidor."
    );
  }
});

// ============================================================
// CALLBACK DO DISCORD
// ============================================================

app.get(
  "/auth/discord/callback",
  async (req, res) => {

    try {

      requireConfig();

      const code =
        String(req.query.code || "");

      const token =
        String(req.query.state || "");

      if (
        !code ||
        !token
      ) {

        return res.status(400).send(`

          <html>

            <body style="
              font-family:Arial;
              background:#111;
              color:#fff;
              text-align:center;
              padding:60px
            ">

              <h1>❌ Link inválido</h1>

              <p>
                Volte para a sala Fúria
                e use <b>!login</b> novamente.
              </p>

            </body>

          </html>

        `);
      }

      const link =
        pendingLinks.get(token);

      if (
        !link ||
        link.expiresAt < Date.now()
      ) {

        return res.status(410).send(`

          <html>

            <body style="
              font-family:Arial;
              background:#111;
              color:#fff;
              text-align:center;
              padding:60px
            ">

              <h1>❌ Link expirado</h1>

              <p>
                Volte para a sala Fúria
                e use <b>!login</b> novamente.
              </p>

            </body>

          </html>

        `);
      }

      // ======================================================
      // TROCAR CODE PELO TOKEN DO DISCORD
      // ======================================================

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

            method:
              "POST",

            headers: {

              "Content-Type":
                "application/x-www-form-urlencoded"

            },

            body:
              tokenBody.toString()

          }
        );

      if (!tokenResponse.ok) {

        const erroTexto =
          await tokenResponse.text();

        console.error(
          "Discord OAuth error:",
          erroTexto
        );

        throw new Error(
          "Discord recusou o código OAuth."
        );
      }

      const oauth =
        await tokenResponse.json();

      if (!oauth.access_token) {

        throw new Error(
          "Discord não forneceu access_token."
        );
      }

      // ======================================================
      // BUSCAR USUÁRIO DO DISCORD
      // ======================================================

      const userResponse =
        await fetch(
          "https://discord.com/api/users/@me",
          {

            headers: {

              Authorization:
                `${oauth.token_type || "Bearer"} ${oauth.access_token}`

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

      console.log(
        `[FÚRIA DISCORD] Usuário autorizado: ${user.username} (${user.id})`
      );

      // ======================================================
      // ENTRAR NO SERVIDOR DISCORD
      // ======================================================

      const joinResponse =
        await fetch(
          `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${user.id}`,
          {

            method:
              "PUT",

            headers: {

              "Authorization":
                `Bot ${DISCORD_BOT_TOKEN}`,

              "Content-Type":
                "application/json"

            },

            body:
              JSON.stringify({

                access_token:
                  oauth.access_token

              })

          }
        );

      if (
        !joinResponse.ok &&
        joinResponse.status !== 204
      ) {

        const joinError =
          await joinResponse.text();

        console.error(
          "[FÚRIA DISCORD] Erro ao adicionar ao servidor:",
          joinError
        );

        throw new Error(
          "Não foi possível adicionar o usuário ao servidor Discord."
        );
      }

      console.log(
        `[FÚRIA DISCORD] ${user.username} entrou no servidor.`
      );

      // ======================================================
      // NICK DO HAXBALL
      //
      // Discord aceita no máximo 32 caracteres.
      // ======================================================

      const discordNick =
        String(link.nick || user.username)
          .trim()
          .slice(0, 32);

      // ======================================================
      // DAR CARGO + ALTERAR NICK
      // ======================================================

      const memberUpdateResponse =
        await fetch(
          `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${user.id}`,
          {

            method:
              "PATCH",

            headers: {

              "Authorization":
                `Bot ${DISCORD_BOT_TOKEN}`,

              "Content-Type":
                "application/json"

            },

            body:
              JSON.stringify({

                nick:
                  discordNick,

                roles:
                  [DISCORD_ROLE_ID]

              })

          }
        );

      if (!memberUpdateResponse.ok) {

        const updateError =
          await memberUpdateResponse.text();

        console.error(
          "[FÚRIA DISCORD] Erro ao colocar cargo/nick:",
          updateError
        );

        throw new Error(
          "Usuário entrou no servidor, mas não foi possível configurar cargo/nick."
        );
      }

      console.log(
        `[FÚRIA DISCORD] Cargo aplicado e nick alterado: ${discordNick}`
      );

      // ======================================================
      // PRESERVAR ESTATÍSTICAS EXISTENTES
      // ======================================================

      const oldAccount =
        accounts.get(link.auth);

      accounts.set(
        link.auth,
        {

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

        }
      );

      // ======================================================
      // FINALIZAR LINK
      // ======================================================

      pendingLinks.delete(token);

      console.log(
        `[FÚRIA DISCORD] Conta vinculada: ${link.nick} -> ${user.username}`
      );

      // ======================================================
      // PÁGINA DE SUCESSO
      // ======================================================

      res.send(`

        <html>

          <head>

            <title>
              Fúria - Conta vinculada
            </title>

          </head>

          <body style="
            font-family:Arial;
            background:#111;
            color:#fff;
            text-align:center;
            padding:60px
          ">

            <h1>
              ✅ Conta vinculada!
            </h1>

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
              HaxBall:
              <b>
                ${escapeHtml(link.nick)}
              </b>
            </p>

            <p>
              Cargo:
              <b>
                aplicado automaticamente
              </b>
            </p>

            <p>
              Nick no servidor:
              <b>
                ${escapeHtml(discordNick)}
              </b>
            </p>

            <p style="
              color:#7DFA89;
              margin-top:30px
            ">
              Você entrou no servidor Fúria
              e sua conta foi configurada automaticamente.
            </p>

            <p style="
              color:#aaa;
              margin-top:20px
            ">
              Você pode voltar para a sala HaxBall.
            </p>

          </body>

        </html>

      `);

    } catch (err) {

      console.error(
        "[FÚRIA DISCORD] Erro no callback:",
        err
      );

      res.status(500).send(`

        <html>

          <body style="
            font-family:Arial;
            background:#111;
            color:#fff;
            text-align:center;
            padding:60px
          ">

            <h1>
              ❌ Erro ao concluir o login
            </h1>

            <p>
              Volte para a sala Fúria
              e use <b>!login</b> novamente.
            </p>

            <p style="
              color:#aaa;
              margin-top:30px
            ">
              Verifique os logs do Render
              para descobrir o erro.
            </p>

          </body>

        </html>

      `);
    }
  }
);

// ============================================================
// VERIFICAR STATUS DO JOGADOR
// ============================================================

app.get(
  "/api/link/status",
  (req, res) => {

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

      linked:
        true,

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
  }
);

// ============================================================
// REGISTRAR RESULTADO DA PARTIDA
// ============================================================

app.post(
  "/api/stats/result",
  (req, res) => {

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
      ![1, 2].includes(
        Number(winnerTeam)
      )
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
        Number(winnerTeam)
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
  }
);

// ============================================================
// ESCAPAR HTML
// ============================================================

function escapeHtml(value) {

  return String(value)
    .replace(
      /[&<>"']/g,
      c => ({

        "&":
          "&amp;",

        "<":
          "&lt;",

        ">":
          "&gt;",

        '"':
          "&quot;",

        "'":
          "&#039;"

      }[c])
    );
}

// ============================================================
// INICIAR SERVIDOR
// ============================================================

app.listen(
  PORT,
  () => {

    console.log(
      `🔥 Fúria Discord Link online na porta ${PORT}`
    );

    console.log(
      `PUBLIC_URL: ${
        PUBLIC_URL ||
        "(não configurada)"
      }`
    );

    console.log(
      `REDIRECT_URI: ${REDIRECT_URI}`
    );

    console.log(
      `DISCORD_GUILD_ID: ${
        DISCORD_GUILD_ID ||
        "(não configurado)"
      }`
    );

    console.log(
      `DISCORD_ROLE_ID: ${
        DISCORD_ROLE_ID ||
        "(não configurado)"
      }`
    );

  }
);
