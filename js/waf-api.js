// ================= CONFIG =================
const TEAM_SLUG = "world-antichess-front";
const NAME_REGEX = /^Weekly WAF-FLED \d+ Arena$/;
const MANUAL_TOURNAMENTS = [
  "ZLfbxNcu",
  "Z2DuzTxs",
  "O4X6VErR",
  "HVMkt9VQ",
  "NmRTO3Nr",
  "wIUsm1em"
];

// ================= SCORING =================
function scoreGame(type, berserk, oppB) {
  if (type === "win") return berserk ? 1.5 : 1;
  if (type === "loss") return -1;
  if (type === "flag_win") return berserk ? 3 : 2;
  if (type === "flag_loss") return oppB ? -3 : -2;
  return 0;
}

// ================= FETCH TEAM TOURNAMENTS =================
async function fetchTeamTournaments() {
  try {
    const res = await fetch(`https://lichess.org/api/team/${TEAM_SLUG}/tournaments`);
    const text = await res.text();

    let tournaments = [];
    try {
      const jsonArray = JSON.parse(text);
      if (Array.isArray(jsonArray)) tournaments = jsonArray;
    } catch {
      tournaments = text
        .trim()
        .split("\n")
        .map(line => JSON.parse(line));
    }

    return tournaments.filter(t => NAME_REGEX.test(t.name));
  } catch {
    return [];
  }
}

// ================= PGN PARSER =================
function parsePGN(pgn) {
  const white = pgn.match(/\[White "(.+?)"]/)[1];
  const black = pgn.match(/\[Black "(.+?)"]/)[1];
  const whiteB = /\[WhiteBerserk "1"]/.test(pgn);
  const blackB = /\[BlackBerserk "1"]/.test(pgn);
  const termination = pgn.match(/\[Termination "(.+?)"]/)?.[1] || "";

  let whiteRes = "draw", blackRes = "draw";
  if (pgn.includes("1-0")) { whiteRes = "win"; blackRes = "loss"; }
  else if (pgn.includes("0-1")) { whiteRes = "loss"; blackRes = "win"; }

  if (termination.includes("Time forfeit")) {
    if (whiteRes === "win") whiteRes = "flag_win";
    if (blackRes === "win") blackRes = "flag_win";
    if (whiteRes === "loss") whiteRes = "flag_loss";
    if (blackRes === "loss") blackRes = "flag_loss";
  }

  return [
    { name: white, res: whiteRes, berserk: whiteB, oppB: blackB },
    { name: black, res: blackRes, berserk: blackB, oppB: whiteB }
  ];
}

// ================= FETCH GAMES =================
async function fetchGames(id) {
  try {
    const res = await fetch(`https://lichess.org/api/tournament/${id}/games`);
    const text = await res.text();
    if (!text.trim()) return [];
    return text.split(/\n(?=\[Event)/).flatMap(parsePGN);
  } catch {
    return [];
  }
}

// ================= RENDER TOURNAMENTS =================
function renderTournaments(tournaments, containerId, lastUpdatedId) {
  const container = document.getElementById(containerId);
  if (!tournaments.length) {
    container.innerHTML = "<p class='loading'>No tournaments found</p>";
    return;
  }

  tournaments.sort((a,b) => b.startsAt - a.startsAt);

  container.innerHTML = tournaments.map(t => {
    const endTime = new Date(t.finishesAt || t.endsAt || t.startsAt);
    const isPast = t.status === "finished" || endTime < new Date();
    const statusClass = isPast ? "status-past" : "status-future";
    const statusText = isPast ? "Finished" : "Upcoming";

    return `
      <div class="tournament-box">
        <a href="https://lichess.org/tournament/${t.id}" target="_blank">${t.name}</a>
        <span class="tournament-status ${statusClass}">${statusText}</span>
        <span>${isPast ? "Ended" : "Starts"}: ${new Date(t.startsAt).toLocaleString()}</span>
      </div>
    `;
  }).join("");

  if (lastUpdatedId) {
    document.getElementById(lastUpdatedId).innerText =
      "Last updated on: " + new Date().toLocaleString();
  }
}

// ================= BUILD LEADERBOARD =================
async function buildLeaderboard(tbodyId = "leaderboard", cardsId = "leaderboardCards", lastUpdatedId = "lastUpdated") {
  const players = {};
  const teamTournaments = await fetchTeamTournaments();
  const TOURNAMENTS = [...new Set([...MANUAL_TOURNAMENTS, ...teamTournaments.map(t => t.id)])];

  const allGamesArrays = await Promise.all(TOURNAMENTS.map(fetchGames));
  const allGames = allGamesArrays.flat();

  allGames.forEach(g => {
    if (!players[g.name]) players[g.name] = { name: g.name, score: 0, waffles: 0, waffled: 0 };
    players[g.name].score += scoreGame(g.res, g.berserk, g.oppB);
    if (g.res === "flag_win") players[g.name].waffles++;
    if (g.res === "flag_loss") players[g.name].waffled++;
  });

  renderLeaderboard(players, tbodyId, cardsId, lastUpdatedId);
}

function renderLeaderboard(players, tbodyId, cardsId, lastUpdatedId) {
  const list = Object.values(players).sort((a,b) => b.score - a.score);
  const tbody = document.querySelector(`#${tbodyId} tbody`);
  const cards = document.getElementById(cardsId);

  tbody.innerHTML = "";
  cards.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading">Loading...</td></tr>`;
    cards.innerHTML = `<div class="loading">Loading...</div>`;
    return;
  }

  list.forEach((p,i) => {
    tbody.innerHTML += `
      <tr>
        <td>${i+1}</td>
        <td>${p.name}</td>
        <td>${p.score}</td>
        <td>${p.waffles || 0}</td>
        <td>${p.waffled || 0}</td>
        <td>${i+1}</td>
        <td>--</td>
      </tr>
    `;

    if (cards) {
      cards.innerHTML += `
        <div class="player-card">
          <div class="card-top"><span class="rank">#${i+1}</span> <span class="username">${p.name}</span></div>
          <div class="card-stats">
            <span>Score <b>${p.score}</b></span>
            <span>🧇 ${p.waffles || 0}</span>
            <span>💥 ${p.waffled || 0}</span>
            <span>Highest Rank: ${i+1}</span>
          </div>
        </div>
      `;
    }
  });

  if (lastUpdatedId) document.getElementById(lastUpdatedId).innerText =
    "Last updated: " + new Date().toLocaleString();
}

// ================= BUILD ACHIEVEMENTS =================
async function buildAchievements() {
  const players = {};
  const podiums = ["podium-waffles", "podium-waffled", "podium-committed"];
  podiums.forEach(id => document.getElementById(id)?.innerHTML = "<p class='loading'>Loading...</p>");

  const teamTournaments = await fetchTeamTournaments();
  const allGamesArrays = await Promise.all(teamTournaments.map(t => fetchGames(t.id)));
  const allGames = allGamesArrays.flat();

  allGames.forEach(g => {
    if (!players[g.name]) players[g.name] = { name: g.name, waffles: 0, waffled: 0, games: 0 };
    if (g.res === "flag_win") players[g.name].waffles++;
    if (g.res === "flag_loss") players[g.name].waffled++;
    players[g.name].games++;
  });

  const list = Object.values(players);

  buildPodium("podium-waffles", list, "waffles");
  buildPodium("podium-waffled", list, "waffled");
  buildPodium("podium-committed", list, "games", true);

  const lastUpdatedEl = document.getElementById("lastUpdated");
  if (lastUpdatedEl) lastUpdatedEl.innerText = "Last updated on: " + new Date().toLocaleString();
}

// ================= BUILD PODIUM =================
function buildPodium(id, data, key, isGames = false) {
  const container = document.getElementById(id);
  if (!container) return;

  const medals = ["🥇", "🥈", "🥉"];
  const top3 = [...data].sort((a,b) => b[key] - a[key]).slice(0,3);

  if (!top3.length) {
    container.innerHTML = "<p class='loading'>No data yet</p>";
    return;
  }

  container.innerHTML = top3.map((p,i) => `
    <div class="podium-slot place-${i+1}">
      <div class="trophy">${medals[i]}</div>
      <div class="name">${p.name}</div>
      <div class="value stat-flash">${p[key]}${isGames ? " games" : ""}</div>
    </div>
  `).join("");
}

// ================= EXPORT FUNCTIONS =================
// For pages to call after DOM load
window.WAF_API = {
  buildLeaderboard,
  buildAchievements,
  fetchTeamTournaments,
  renderTournaments
};
