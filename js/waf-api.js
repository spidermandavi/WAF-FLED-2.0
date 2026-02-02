<script>
// ================= GLOBAL CONFIG =================
const TEAM_SLUG = "world-antichess-front";
const NAME_REGEX = /^Weekly WAF-FLED \d+ Arena$/;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

// ================= FETCH TEAM TOURNAMENTS =================
async function fetchWafTournaments() {
  try {
    const res = await fetch(`https://lichess.org/api/team/${TEAM_SLUG}/tournaments`);
    const text = await res.text();

    const tournaments = text
      .trim()
      .split("\n")
      .map(l => JSON.parse(l))
      .filter(t => NAME_REGEX.test(t.name))
      .sort((a, b) => b.startsAt - a.startsAt);

    return tournaments;
  } catch (e) {
    console.warn("Failed to fetch tournaments", e);
    return [];
  }
}

// ================= FETCH GAMES =================
async function fetchTournamentGames(id) {
  try {
    const r = await fetch(`https://lichess.org/api/tournament/${id}/games`);
    const txt = await r.text();
    if (!txt.trim()) return [];
    return txt.split(/\n(?=\[Event)/);
  } catch {
    return [];
  }
}

// ================= PGN PARSER =================
function parsePGN(pgn) {
  const white = pgn.match(/\[White "(.+?)"]/)[1];
  const black = pgn.match(/\[Black "(.+?)"]/)[1];
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
    { name: white, res: whiteRes },
    { name: black, res: blackRes }
  ];
}

// ================= UTIL =================
function autoRefresh(fn) {
  setInterval(fn, AUTO_REFRESH_MS);
}
</script>
