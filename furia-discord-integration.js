/*
============================================================
FÚRIA — INTEGRAÇÃO DISCORD ↔ HAXBALL
============================================================

Este arquivo foi feito para o seu bot atual.

Seu bot já cria:
    room = HBInit(...)
e já possui:
    sala
    roomNameString
    room
    localStorage

COMO USAR:
1. Coloque este bloco DEPOIS de criar "room".
2. Configure FURIA_API_URL e FURIA_API_SECRET.
3. Cole os handlers abaixo junto aos outros room.on... do seu bot.

O sistema usa player.auth como identificador da conta HaxBall.
Não use o IP/conn como identidade da conta.

============================================================
*/

const FURIA_API_URL = "COLOQUE_A_URL_DO_RENDER_AQUI";
const FURIA_API_SECRET = "COLOQUE_O_MESMO_SEGREDO_DO_RENDER_AQUI";

const FURIA_RANKS = [
    { min: 0,  max: 19,  icon: "🥉", name: "Bronze 1" },
    { min: 20, max: 29,  icon: "🥉", name: "Bronze 2" },
    { min: 30, max: 39,  icon: "🥉", name: "Bronze 3" },
    { min: 40, max: 44,  icon: "🥈", name: "Prata 1" },
    { min: 45, max: 49,  icon: "🥈", name: "Prata 2" },
    { min: 50, max: 54,  icon: "🥈", name: "Prata 3" },
    { min: 55, max: 59,  icon: "🥇", name: "Ouro 1" },
    { min: 60, max: 64,  icon: "🥇", name: "Ouro 2" },
    { min: 65, max: 69,  icon: "🥇", name: "Ouro 3" },
    { min: 70, max: 74,  icon: "💎", name: "Diamante 1" },
    { min: 75, max: 79,  icon: "💎", name: "Diamante 2" },
    { min: 80, max: 84,  icon: "💎", name: "Diamante 3" },
    { min: 85, max: 89,  icon: "🏆", name: "Campeão" },
    { min: 90, max: 100, icon: "👑", name: "Mestre" }
];

function furiaRank(winRate) {
    const n = Number(winRate) || 0;
    return FURIA_RANKS.find(r => n >= r.min && n <= r.max) || FURIA_RANKS[0];
}

function furiaApi(path, options = {}) {
    return fetch(`${FURIA_API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
}

async function furiaLogin(player) {
    if (!player.auth) {
        room.sendAnnouncement("❌ Não foi possível identificar sua conta HaxBall.", player.id, 0xFA5646, "bold", 1);
        return;
    }

    try {
        const response = await furiaApi("/api/link/start", {
            method: "POST",
            body: JSON.stringify({
                auth: player.auth,
                nick: player.name
            })
        });

        const data = await response.json();

        if (!data.ok) {
            room.sendAnnouncement("❌ Não foi possível gerar seu link de login.", player.id, 0xFA5646, "bold", 1);
            return;
        }

        room.sendAnnouncement("🔗 Seu link de login Discord foi gerado:", player.id, 0x7DFA89, "bold", 1);
        room.sendAnnouncement(data.url, player.id, 0x05C5FF, "normal", 1);
        room.sendAnnouncement("⏱️ O link expira em 10 minutos.", player.id, 0xCCCCCC, "normal", 1);
    } catch (err) {
        console.error("[FÚRIA LOGIN]", err);
        room.sendAnnouncement("❌ O sistema de login está temporariamente indisponível.", player.id, 0xFA5646, "bold", 1);
    }
}

async function furiaCheckLogin(player, notify = true) {
    if (!player.auth) return null;

    try {
        const response = await furiaApi(`/api/link/status?auth=${encodeURIComponent(player.auth)}`);
        if (!response.ok) return null;

        const data = await response.json();

        if (!data.linked) {
            if (notify) {
                room.sendAnnouncement(
                    "🔐 Você não está logado. Use !login para registrar seu histórico de partidas e receber seu rank.",
                    player.id,
                    0xFFC12F,
                    "bold",
                    1
                );
            }
            return null;
        }

        return data;
    } catch (err) {
        console.error("[FÚRIA STATUS]", err);
        return null;
    }
}

function furiaFormatPlayer(player, account) {
    if (!account) return `${player.name}:`;

    const rank = furiaRank(account.winRate);
    return `${rank.icon} 「${rank.name}」 [✅] ${player.name}:`;
}

// Retorna somente os dados necessários para registrar uma partida.
function furiaCollectPlayers() {
    return room.getPlayerList()
        .filter(p => p.team === 1 || p.team === 2)
        .map(p => ({
            auth: p.auth,
            team: p.team,
            name: p.name
        }))
        .filter(p => p.auth);
}

async function furiaRegisterResult(winnerTeam) {
    const players = furiaCollectPlayers();

    if (!players.length) return;

    try {
        await furiaApi("/api/stats/result", {
            method: "POST",
            headers: { "x-furia-secret": FURIA_API_SECRET },
            body: JSON.stringify({
                auths: players,
                winnerTeam
            })
        });
    } catch (err) {
        console.error("[FÚRIA STATS]", err);
    }
}

/*
============================================================
COLOQUE ESTES HANDLERS NO SEU BOT
============================================================
*/

// Quando o jogador entra:
room.onPlayerJoin = function(player) {
    setTimeout(() => furiaCheckLogin(player, true), 1000);

    // IMPORTANTE:
    // Se seu bot já possui room.onPlayerJoin, NÃO crie outro.
    // Coloque apenas:
    // setTimeout(() => furiaCheckLogin(player, true), 1000);
    // dentro do handler existente.
};

// Comando !login:
const furiaOriginalOnPlayerChat = room.onPlayerChat;
room.onPlayerChat = function(player, message) {
    if (message.trim().toLowerCase() === "!login") {
        furiaLogin(player);
        return false;
    }

    return furiaOriginalOnPlayerChat ? furiaOriginalOnPlayerChat(player, message) : true;
};

/*
IMPORTANTE SOBRE O CHAT:

Seu bot original já possui um sistema grande de chat/comandos.
Se ele já define room.onPlayerChat, NÃO use o bloco acima inteiro.

Dentro do SEU onPlayerChat existente, adicione:

if (message.trim().toLowerCase() === "!login") {
    furiaLogin(player);
    return false;
}

E, quando for montar a mensagem normal do chat, use:

const conta = await furiaCheckLogin(player, false);
const prefixo = furiaFormatPlayer(player, conta);

Por exemplo:
room.sendAnnouncement(`${prefixo} ${message}`, null, 0xFFFFFF, "normal");

Se não estiver logado:
DeBrito: mensagem

Se estiver logado:
🥇 「Ouro 2」 [✅] DeBrito: mensagem
*/

/*
REGISTRO DE PARTIDA:

No evento em que seu bot detecta o final da partida, chame:

furiaRegisterResult(Team.RED);

ou

furiaRegisterResult(Team.BLUE);

dependendo de quem venceu.

NÃO coloque isso em onTeamGoal.
Use somente no evento que realmente encerra a partida.
*/
