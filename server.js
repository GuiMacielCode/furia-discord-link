const express = require("express");
const crypto = require("crypto");
const {
  Client,
  GatewayIntentBits
} = require("discord.js");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const PORT = process.env.PORT || 3000;

const PUBLIC_URL = (process.env.PUBLIC_URL || "")
  .replace(/\/$/, "");

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI ||
  PUBLIC_URL + "/auth/discord/callback";

// ============================================================
// CONFIGURAÇÃO DO SERVIDOR DISCORD
// ============================================================

const DISCORD_GUILD_ID =
  "1552660389387304960";

const DISCORD_ROLE_ID =
  "1552723073533218897";

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
    res.header(
      "Access-Control-Allow-Origin",
      origin
    );
  }

  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

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
// BOT DISCORD
// ============================================================

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

// ============================================================
// QUANDO O BOT FICAR ONLINE
// ============================================================

discordClient.once("ready", () => {
  console.log(
    `🤖 Bot Discord online como ${discordClient.user.tag}`
  );

  console.log(
    `🏠 Servidor configurado: ${DISCORD_GUILD_ID}`
  );

  console.log(
    `🏆 Cargo configurado: ${DISCORD_ROLE_ID}`
  );
});

// ============================================================
// ERROS DO BOT
// ============================================================

discordClient.on("error", (error) => {

  console.error(
    "[DISCORD BOT ERROR]",
    error
  );

});

// ============================================================
// INICIAR BOT
// ============================================================

if (BOT_TOKEN) {

  discordClient.login(BOT_TOKEN)
    .catch((error) => {

      console.error(
        "[DISCORD BOT] Não foi possível iniciar o bot:",
        error
      );

    });

} else {

  console.error(
    "[DISCORD BOT] DISCORD_BOT_TOKEN não configurado."
  );

}

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

setInterval(
  cleanup,
  60_000
).unref();

// ============================================================
// VERIFICAR CONFIGURAÇÃO
// ============================================================

function requireConfig() {

  if (
    !PUBLIC_URL ||
    !CLIENT_ID ||
    !CLIENT_SECRET ||
    !BOT_TOKEN
  ) {

    throw new Error(
      "Configure PUBLIC_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET e DISCORD_BOT_TOKEN."
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
        <title>Fúria - Login Discord</title>
      </head>

      <body style="
        font-family:Arial;
        background:#111;
        color:#fff;
        padding:40px
      ">

        <h1>🔥 Fúria — Login Discord</h1>

        <p>
          Sistema de vinculação HaxBall ↔ Discord online.
        </p>

      </body>

    </html>
  `);

});

// ============================================================
// INICIAR LOGIN
// HaxBall chama através do !login
// ============================================================

app.post(
  "/api/link/start",
  (req, res) => {

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

      pendingLinks.set(
        token,
        {

          auth,

          nick:
            String(nick || "")
              .slice(0, 32),

          expiresAt:
            Date.now() +
            10 * 60 * 1000

        }
      );

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

  }
);

// ============================================================
// PÁGINA DO LINK
// ============================================================

app.get(
  "/link/:token",
  (req, res) => {

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

      // ======================================================
      // O TOKEN VAI NO STATE
      // ======================================================

      const params =
        new URLSearchParams({

          client_id:
            CLIENT_ID,

          response_type:
            "code",

          redirect_uri:
            REDIRECT_URI,

          // IMPORTANTE:
          // identify = identificar usuário
          // guilds.join = colocar usuário no servidor
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
              Ao continuar, você será vinculado
              ao servidor Fúria.
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

  }
);

// ============================================================
// CALLBACK DO DISCORD
// ============================================================

app.get(
  "/auth/discord/callback",
  async (req, res) => {

    try {

      requireConfig();

      const code =
        String(
          req.query.code || ""
        );

      const token =
        String(
          req.query.state || ""
        );

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

        const errorText =
          await tokenResponse.text();

        console.error(
          "[DISCORD OAUTH]",
          errorText
        );

        throw new Error(
          "Discord recusou o código OAuth."
        );

      }

      const oauth =
        await tokenResponse.json();

      if (
        !oauth.access_token
      ) {

        throw new Error(
          "Discord não forneceu access_token."
        );

      }

      // ======================================================
      // BUSCAR USUÁRIO
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

      const discordName =
        user.global_name ||
        user.username;

      // ======================================================
      // PEGAR SERVIDOR
      // ======================================================

      const guild =
        await discordClient.guilds.fetch(
          DISCORD_GUILD_ID
        );

      if (!guild) {

        throw new Error(
          "O bot não encontrou o servidor configurado."
        );

      }

      console.log(
        `[FÚRIA DISCORD] Vinculando ${link.nick} -> ${discordName}`
      );

      // ======================================================
      // ADICIONAR USUÁRIO AO SERVIDOR
      // ======================================================

      let member;

      try {

        member =
          await guild.members.fetch(
            user.id
          );

      } catch {

        member = null;

      }

      // ======================================================
      // SE A PESSOA AINDA NÃO ESTIVER NO SERVIDOR
      // ======================================================

      if (!member) {

        console.log(
          `[FÚRIA DISCORD] ${discordName} não estava no servidor. Adicionando...`
        );

        member =
          await guild.members.add(
            user.id,
            {

              accessToken:
                oauth.access_token,

              nick:
                link.nick,

              roles:
                [DISCORD_ROLE_ID]

            }
          );

        console.log(
          `[FÚRIA DISCORD] ${discordName} entrou no servidor.`
        );

      } else {

        // ====================================================
        // SE JÁ ESTIVER NO SERVIDOR
        // ====================================================

        console.log(
          `[FÚRIA DISCORD] ${discordName} já estava no servidor.`
        );

        // ----------------------------------------------------
        // ALTERAR NICK
        // ----------------------------------------------------

        try {

          await member.setNickname(
            link.nick
          );

          console.log(
            `[FÚRIA DISCORD] Nick alterado para ${link.nick}`
          );

        } catch (err) {

          console.error(
            "[FÚRIA DISCORD] Não foi possível alterar o nick:",
            err.message
          );

        }

        // ----------------------------------------------------
        // ADICIONAR CARGO
        // ----------------------------------------------------

        try {

          if (
            !member.roles.cache.has(
              DISCORD_ROLE_ID
            )
          ) {

            await member.roles.add(
              DISCORD_ROLE_ID
            );

            console.log(
              `[FÚRIA DISCORD] Cargo adicionado.`
            );

          }

        } catch (err) {

          console.error(
            "[FÚRIA DISCORD] Não foi possível adicionar o cargo:",
            err.message
          );

        }

      }

      // ======================================================
      // PRESERVAR ESTATÍSTICAS
      // ======================================================

      const oldAccount =
        accounts.get(
          link.auth
        );

      accounts.set(
        link.auth,
        {

          discordId:
            user.id,

          discordName:
            discordName,

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

      pendingLinks.delete(
        token
      );

      console.log(
        `[FÚRIA DISCORD] VÍNCULO CONCLUÍDO: ${link.nick} -> ${discordName}`
      );

      // ======================================================
      // SUCESSO
      // ======================================================

      res.send(`
        <html>

          <head>
            <title>Fúria - Conta vinculada</title>
          </head>

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
                ${escapeHtml(discordName)}
              </b>
            </p>

            <p>
              HaxBall:
              <b>
                ${escapeHtml(link.nick)}
              </b>
            </p>

            <p>
              🏆 Cargo atribuído.
            </p>

            <p>
              🏠 Entrada no servidor concluída.
            </p>

            <p>
              👤 Nick alterado para:
              <b>
                ${escapeHtml(link.nick)}
              </b>
            </p>

            <p style="
              color:#7DFA89;
              margin-top:30px
            ">
              Você pode voltar para a sala Fúria.
            </p>

          </body>

        </html>
      `);

    } catch (err) {

      console.error(
        "[FÚRIA DISCORD] ERRO NO CALLBACK:",
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

            <h1>❌ Erro ao concluir o login</h1>

            <p>
              ${escapeHtml(
                err.message ||
                "Erro desconhecido."
              )}
            </p>

            <p>
              Volte para a sala Fúria
              e use <b>!login</b> novamente.
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
      String(
        req.query.auth || ""
      );

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
      req.get(
        "x-furia-secret"
      );

    if (
      !process.env.FURIA_API_SECRET ||
      secret !==
        process.env.FURIA_API_SECRET
    ) {

      return res.status(401).json({
        ok: false
      });

    }

    const {
      auths,
      winnerTeam
    } =
      req.body || {};

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

    for (
      const item
      of auths
    ) {

      if (
        !item ||
        !item.auth
      ) {

        continue;

      }

      const account =
        accounts.get(
          item.auth
        );

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
      `REDIRECT_URI: ${
        REDIRECT_URI
      }`
    );

    console.log(
      `DISCORD GUILD: ${
        DISCORD_GUILD_ID
      }`
    );

    console.log(
      `DISCORD ROLE: ${
        DISCORD_ROLE_ID
      }`
    );

  }
);
