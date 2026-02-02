// ================= WAF-FLED API MODULE =================
const WAF_API = (() => {
  const TEAM_SLUG = "world-antichess-front";
  const NAME_REGEX = /^Weekly WAF-FLED \d+ Arena$/;

  // Fetch tournaments from team
  async function fetchTeamTournaments() {
    try {
      const res = await fetch(`https://lichess.org/api/team/${TEAM_SLUG}/tournaments`);
      const data = await res.json();
      return Array.isArray(data) ? data.filter(t => NAME_REGEX.test(t.name)) : [];
    } catch(e) {
      console.error("Failed to fetch tournaments:", e);
      return [];
    }
  }

  // Fetch games for a tournament
  async function fetchGames(tid) {
    try {
      const res = await fetch(`https://lichess.org/api/tournament/${tid}/games`);
      const txt = await res.text();
      if (!txt.trim()) return [];
      return txt.split(/\n(?=\[Event)/).flatMap(parsePGN);
    } catch(e) {
      console.error(`Failed to fetch games for ${tid}:`, e);
      return [];
    }
  }

  // Parse PGN
  function parsePGN(pgn) {
    const white = pgn.match(/\[White "(.+?)"]/)[1];
    const black = pgn.match(/\[Black "(.+?)"]/)[1];
    const whiteB = /\[WhiteBerserk "1"]/.test(pgn);
    const blackB = /\[BlackBerserk "1"]/.test(pgn);
    const termination = pgn.match(/\[Termination "(.+?)"]/)?.[1] || "";

    let whiteRes = "draw", blackRes = "draw";
    if(pgn.includes("1-0")) { whiteRes="win"; blackRes="loss"; }
    else if(pgn.includes("0-1")) { whiteRes="loss"; blackRes="win"; }

    if(termination.includes("Time forfeit")) {
      if(whiteRes==="win") whiteRes="flag_win";
      if(blackRes==="win") blackRes="flag_win";
      if(whiteRes==="loss") whiteRes="flag_loss";
      if(blackRes==="loss") blackRes="flag_loss";
    }

    return [
      { name:white, res:whiteRes, berserk:whiteB, oppB:blackB },
      { name:black, res:blackRes, berserk:blackB, oppB:whiteB }
    ];
  }

  // Render tournaments (for results page)
  function renderTournaments(tournaments, containerId="tournamentContainer", lastUpdatedId="lastUpdated") {
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

    document.getElementById(lastUpdatedId).innerText =
      "Last updated on: " + new Date().toLocaleString();
  }

  // Leaderboard builder
  async function buildLeaderboard() {
    const MANUAL_TOURNAMENTS = [
      "ZLfbxNcu","Z2DuzTxs","O4X6VErR","HVMkt9VQ","NmRTO3Nr","wIUsm1em"
    ];
    const players = {};
    renderPlayers(players);

    const teamTournaments = await fetchTeamTournaments();
    const TOURNAMENTS = [...new Set([...MANUAL_TOURNAMENTS, ...teamTournaments.map(t=>t.id)])];

    const gamesArrays = await Promise.all(TOURNAMENTS.map(fetchGames));
    const allGames = gamesArrays.flat();

    allGames.forEach(g => {
      if(!players[g.name]) players[g.name]={name:g.name, score:0, waffles:0, waffled:0};
      players[g.name].score += scoreGame(g.res,g.berserk,g.oppB);
      if(g.res==="flag_win") players[g.name].waffles++;
      if(g.res==="flag_loss") players[g.name].waffled++;
    });

    renderPlayers(players);
    document.getElementById("lastUpdated").innerText =
      "Last updated: " + new Date().toLocaleString();
  }

  // Achievements builder
  async function buildAchievements() {
    const players = {};
    document.querySelectorAll(".podium").forEach(p=>p.innerHTML="<p class='loading'>Loading...</p>");

    const tmtIds = (await fetchTeamTournaments()).map(t=>t.id);
    const gamesArrays = await Promise.all(tmtIds.map(fetchGames));
    const allGames = gamesArrays.flat();

    allGames.forEach(g=>{
      if(!players[g.name]) players[g.name]={name:g.name, waffles:0, waffled:0, games:0};
      if(g.res==="flag_win") players[g.name].waffles++;
      if(g.res==="flag_loss") players[g.name].waffled++;
      players[g.name].games++;
    });

    const list = Object.values(players);
    buildPodium("podium-waffles", list, "waffles");
    buildPodium("podium-waffled", list, "waffled");
    buildPodium("podium-committed", list, "games", true);

    document.getElementById("lastUpdated").innerText =
      "Last updated on: " + new Date().toLocaleString();
  }

  // Helpers
  function scoreGame(type, berserk, oppB) {
    if(type==="win") return berserk?1.5:1;
    if(type==="loss") return -1;
    if(type==="flag_win") return berserk?3:2;
    if(type==="flag_loss") return oppB?-3:-2;
    return 0;
  }

  function renderPlayers(players, deltaScores={}) {
    const list = Object.values(players).sort((a,b)=>b.score-a.score);
    const tbody = document.querySelector("#leaderboard tbody");
    const cards = document.querySelector("#leaderboardCards");

    tbody.innerHTML = "";
    cards.innerHTML = "";

    if(!list.length){
      tbody.innerHTML = `<tr><td colspan="7" class="loading"><div class="spinner"></div>Loading...</td></tr>`;
      cards.innerHTML = `<div class="loading"><div class="spinner"></div>Loading...</div>`;
      return;
    }

    list.forEach((p,i)=>{
      const delta = deltaScores[p.name] || 0;
      const color = delta>0?"green":delta<0?"red":"white";
      const deltaSpan = `<span class="delta-flash" style="color:${color}">${delta>0?"+":""}${delta}</span>`;

      tbody.innerHTML += `
        <tr>
          <td>${i+1}</td>
          <td>${p.name}</td>
          <td>${p.score}</td>
          <td>${p.waffles||0}</td>
          <td>${p.waffled||0}</td>
          <td>${i+1}</td>
          <td>${deltaSpan}</td>
        </tr>
      `;

      cards.innerHTML += `
        <div class="player-card">
          <div class="card-top"><span class="rank">#${i+1}</span> <span class="username">${p.name}</span></div>
          <div class="card-stats">
            <span>Score <b>${p.score}</b></span>
            <span>🧇 ${p.waffles||0}</span>
            <span>💥 ${p.waffled||0}</span>
            <span>Highest Rank: ${i+1}</span>
            <span>${deltaSpan}</span>
          </div>
        </div>
      `;
    });
  }

  function buildPodium(id,data,key,isGames=false){
    const medals=["🥇","🥈","🥉"];
    const container=document.getElementById(id);
    const top3=[...data].sort((a,b)=>b[key]-a[key]).slice(0,3);
    if(!top3.length){ container.innerHTML="<p class='loading'>No data yet</p>"; return; }

    container.innerHTML=top3.map((p,i)=>`
      <div class="podium-slot place-${i+1}">
        <div class="trophy">${medals[i]}</div>
        <div class="name">${p.name}</div>
        <div class="value stat-flash">
          ${p[key]}${isGames?" games":""}
        </div>
      </div>
    `).join("");
  }

  return {
    fetchTeamTournaments,
    renderTournaments,
    buildLeaderboard,
    buildAchievements
  };
})();
