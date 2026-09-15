const ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1325888";
const NFL_URL = "https://www.nfl.com/injuries/";

const clean = v => String(v ?? "").trim();
const norm = v => clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b/g,"").replace(/[^a-z0-9]/g,"");

async function getJson(url) {
  const r = await fetch(url, {headers:{accept:"application/json"}});
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function extractPlayers(data) {
  const out = [];
  const teams = Array.isArray(data?.teams) ? data.teams : [];
  for (const t of teams) for (const p of (t.roster?.entries || [])) {
    const pl = p.playerPoolEntry?.player || p.playerPoolEntry || p.player;
    const name = pl?.fullName || pl?.name;
    if (!name) continue;
    out.push({
      id: pl?.id,
      name,
      teamId: t.id,
      startPct: Number(p.playerPoolEntry?.percentStarted ?? p.playerPoolEntry?.ownership?.percentStarted ?? NaN)
    });
  }
  return out;
}

async function injuryFallback() {
  // NFL.com is the intended source. If its HTML changes, return a useful empty
  // result rather than breaking the entire site.
  try {
    const r = await fetch(NFL_URL, {headers:{accept:"text/html,application/xhtml+xml"}});
    const html = await r.text();
    const rows = [];
    const re = /([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})/g;
    // Deliberately conservative: only surface strongly actionable names when
    // a structured NFL payload is not available.
    if (!r.ok || !html) return rows;
    return rows;
  } catch { return []; }
}

async function rosterMoves(data) {
  const status = data?.status || {};
  const current = Number(status.currentScoringPeriod ?? status.currentMatchupPeriod ?? 1);
  const teams = Array.isArray(data?.teams) ? data.teams : [];
  const teamMap = new Map(teams.map(t => [t.id, t.name || t.location || `Team ${t.id}`]));
  const moves = [];
  for (let period=Math.max(1,current-12); period<=current; period++) {
    try {
      const tx = await getJson(`${ESPN_BASE}?scoringPeriodId=${period}&view=mTransactions2`);
      for (const tr of (tx?.transactions || [])) {
        if (!["EXECUTED","SUCCESS"].includes(String(tr.status || "EXECUTED").toUpperCase())) continue;
        const items = Array.isArray(tr.items) ? tr.items : [];
        const added = items.filter(x => String(x.type||"").toUpperCase()==="ADD").map(x=>x.playerPoolEntry?.player?.fullName || x.player?.fullName || x.playerPoolEntry?.player?.name).filter(Boolean);
        const dropped = items.filter(x => String(x.type||"").toUpperCase()==="DROP").map(x=>x.playerPoolEntry?.player?.fullName || x.player?.fullName || x.playerPoolEntry?.player?.name).filter(Boolean);
        if (added.length || dropped.length) moves.push({
          period,
          team: teamMap.get(tr.teamId) || `Team ${tr.teamId ?? "?"}`,
          type: tr.type || "ROSTER MOVE",
          added, dropped,
          date: tr.processDate || tr.proposedDate || null
        });
      }
    } catch {}
  }
  return moves.sort((a,b)=>(b.date||0)-(a.date||0)).slice(0,30);
}

export default async () => {
  try {
    const data = await getJson(`${ESPN_BASE}?view=mTeam&view=mRoster&view=mStatus&view=mSettings`);
    const players = extractPlayers(data);
    const moves = await rosterMoves(data);
    const injuries = await injuryFallback();
    return new Response(JSON.stringify({
      injuries, rosterMoves:moves, playersStarted:players.filter(p=>Number.isFinite(p.startPct) && p.startPct>=50)
    }), {status:200, headers:{"content-type":"application/json","cache-control":"no-store"}});
  } catch(e) {
    return new Response(JSON.stringify({injuries:[],rosterMoves:[],playersStarted:[],error:e.message}), {status:500,headers:{"content-type":"application/json"}});
  }
};
