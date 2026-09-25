# Fúria — Discord ↔ HaxBall

Projeto feito especificamente para o bot HaxBall enviado pelo usuário.

## O que ele faz

- `!login` gera um link privado para o jogador.
- O jogador entra com Discord via OAuth2.
- O `player.auth` do HaxBall fica vinculado ao Discord.
- O bot pode consultar se o jogador está vinculado.
- Jogadores vinculados recebem `[✅]`.
- O servidor registra vitórias/derrotas e calcula Win Rate.
- O rank é baseado no Win Rate definido pelo servidor Fúria.

## Ranks

Bronze 1: 0–19%
Bronze 2: 20–29%
Bronze 3: 30–39%
Prata 1: 40–44%
Prata 2: 45–49%
Prata 3: 50–54%
Ouro 1: 55–59%
Ouro 2: 60–64%
Ouro 3: 65–69%
Diamante 1: 70–74%
Diamante 2: 75–79%
Diamante 3: 80–84%
Campeão: 85–89%
Mestre: 90–100%

## Observação importante

O `server.js` usa memória para armazenar as contas nesta primeira versão.
Isso significa que contas podem ser perdidas se o serviço for reiniciado/recriado.

Para uma versão definitiva, troque o armazenamento por SQLite ou PostgreSQL.

## Render

Build command:
npm install

Start command:
npm start

Variáveis:
PUBLIC_URL
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_REDIRECT_URI
SESSION_SECRET
FURIA_API_SECRET

## Discord Developer Portal

OAuth2 Redirect URI:
https://SEU-SERVICO.onrender.com/auth/discord/callback

Não coloque CLIENT_SECRET no código do HaxBall.
Não coloque o segredo do Discord no GitHub.

## Bot

O arquivo `furia-discord-integration.js` contém o código específico que deve ser incorporado ao seu bot atual.

O seu bot já usa `room = HBInit(...)`, `localStorage`, `roomNameString` e `sala`; por isso a integração não recria a sala nem substitui essas partes.

Também NÃO substitua seu `onPlayerJoin` ou `onPlayerChat` inteiro se eles já existem. Insira apenas os trechos indicados no arquivo de integração.
