const ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1325888";

const clean = (v) => String(v ?? "").trim();
const teamName = (t) => clean(t?.name || t?.location || t?.abbrev || `Team ${t?.id ?? ""}`);

async function espn(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  return r.json();
}

function normalizeTeams(data) {
  const teams = Array.isArray(data?.teams) ? data.teams : [];
  return teams.map(t => ({
    id: t.id,
    name: teamName(t),
    wins: Number(t.record?.overall?.wins ?? t.record?.overall?.record?.wins ?? 0),
    losses: Number(t.record?.overall?.losses ?? t.record?.overall?.record?.losses ?? 0),
    pointsFor: Number(t.record?.overall?.pointsFor ?? t.pointsFor ?? 0)
  }));
}

function matchups(data) {
  const sched = Array.isArray(data?.schedule) ? data.schedule : [];
  return sched.map(g => ({
    period: Number(g.matchupPeriodId ?? g.scoringPeriodId ?? 0),
    homeId: g.home?.teamId ?? g.home?.team?.id ?? null,
    awayId: g.away?.teamId ?? g.away?.team?.id ?? null,
    homeScore: Number(g.home?.totalScore ?? g.home?.score ?? 0),
    awayScore: Number(g.away?.totalScore ?? g.away?.score ?? 0)
  })).filter(g => g.homeId != null && g.awayId != null);
}

export default async () => {
  try {
    const data = await espn(`${ESPN_BASE}?view=mTeam&view=mSchedule&view=mStatus&view=mSettings`);
    const teams = normalizeTeams(data);
    const games = matchups(data);
    const current = Number(data?.status?.currentMatchupPeriod ?? data?.status?.currentScoringPeriod ?? 1);
    const previousWeek = Math.max(1, current - 1);
    const prev = games.filter(g => g.period === previousWeek);

    const byId = new Map(teams.map(t => [t.id, t]));
    const played = prev.filter(g => Number.isFinite(Number(g.homeScore)) && Number.isFinite(Number(g.awayScore))).map(g => {
      const home = byId.get(g.homeId) || {id:g.homeId,name:`Team ${g.homeId}`};
      const away = byId.get(g.awayId) || {id:g.awayId,name:`Team ${g.awayId}`};
      const margin = Math.abs(g.homeScore - g.awayScore);
      return { ...g, home, away, margin, winner: g.homeScore >= g.awayScore ? home : away,
        loser: g.homeScore >= g.awayScore ? away : home };
    });

    const recent = (id) => games.filter(g => g.period < current && g.period >= Math.max(1,current-3))
      .filter(g => g.homeId === id || g.awayId === id)
      .reduce((n,g) => n + (((g.homeId===id ? g.homeScore : g.awayScore) > (g.homeId===id ? g.awayScore : g.homeScore)) ? 1 : 0), 0);

    const rankings = teams.map(t => ({
      ...t,
      recentWins: recent(t.id),
      score: t.wins * 12 + Math.min(t.pointsFor / 20, 60)
    })).sort((a,b)=>b.score-a.score).map((t,i)=>({...t,rank:i+1}));

    const hot = [...rankings].sort((a,b)=>b.recentWins-a.recentWins || b.pointsFor-a.pointsFor)[0] || null;
    const cold = [...rankings].sort((a,b)=>a.recentWins-b.recentWins || a.pointsFor-b.pointsFor)[0] || null;
    const highest = played.length ? [...played].sort((a,b)=>Math.max(b.homeScore,b.awayScore)-Math.max(a.homeScore,a.awayScore))[0] : null;
    const blowout = played.length ? [...played].sort((a,b)=>b.margin-a.margin)[0] : null;
    const closest = played.length ? [...played].sort((a,b)=>a.margin-b.margin)[0] : null;

    return new Response(JSON.stringify({
      week: current, previousWeek,
      powerRankings: rankings,
      pulse: { hot, cold, previousGames: played.length },
      awards: {
        highScore: highest ? Math.max(highest.homeScore, highest.awayScore) : null,
        teamOfWeek: highest ? (highest.homeScore >= highest.awayScore ? highest.home : highest.away) : null,
        biggestBlowout: blowout,
        closestGame: closest
      },
      drama: blowout
        ? { headline:"THE STATEMENT GAME", text:`${blowout.winner.name} won by ${blowout.margin} points in Week ${previousWeek}.` }
        : closest
          ? { headline:"DOWN TO THE WIRE", text:`${closest.home.name} and ${closest.away.name} were separated by ${closest.margin} point${closest.margin===1?"":"s"}.` }
          : { headline:"LEAGUE PULSE", text:"The newsroom is waiting on the latest completed matchup data." }
    }), {status:200, headers:{"content-type":"application/json","cache-control":"no-store"}});
  } catch (e) {
    return new Response(JSON.stringify({error:e.message}), {status:500, headers:{"content-type":"application/json"}});
  }
};
