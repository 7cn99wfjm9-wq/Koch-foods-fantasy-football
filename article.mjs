const ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1325888";
async function getJson(url){const r=await fetch(url,{headers:{accept:"application/json"}});if(!r.ok)throw new Error(`ESPN ${r.status}`);return r.json();}
const name=t=>t?.name||t?.location||`Team ${t?.id??""}`;
export default async (req) => {
  try {
    const data=await getJson(`${ESPN_BASE}?view=mTeam&view=mSchedule&view=mStatus`);
    const teams=Array.isArray(data?.teams)?data.teams:[];
    const byId=new Map(teams.map(t=>[t.id,name(t)]));
    const current=Number(data?.status?.currentMatchupPeriod??1), previous=Math.max(1,current-1);
    const games=(data?.schedule||[]).filter(g=>Number(g.matchupPeriodId)===previous);
    const parts=games.map(g=>`${byId.get(g.home?.teamId)||"Home"} ${Number(g.home?.totalScore||0)} — ${Number(g.away?.totalScore||0)} ${byId.get(g.away?.teamId)||"Away"}`);
    const title=`Week ${previous} Recap: The Koch Foods League Report`;
    const body=parts.length?`Week ${previous} is in the books.\n\n${parts.join("\n")}\n\nThe league now turns its attention to Week ${current}.`: `The newsroom is waiting for completed Week ${previous} matchup data.`;
    return new Response(JSON.stringify({title,dek:`The latest from Koch Foods Fantasy Football 2026.`,body,type:"recap",week:previous}),{status:200,headers:{"content-type":"application/json"}});
  } catch(e){return new Response(JSON.stringify({error:e.message}),{status:500,headers:{"content-type":"application/json"}});}
};
