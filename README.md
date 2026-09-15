# Koch Foods Fantasy Football Newsroom

Connected to ESPN league 1325888 for the 2026 season.

## Included
- Live ESPN standings and matchups
- Sportswriter-style Tuesday recaps and Friday previews
- Persistent article archive with Netlify Blobs
- League History page with lifetime team records and head-to-head matchup records
- Historical ESPN season discovery via `mStatus.previousSeasons`
- Graceful handling when ESPN restricts historical seasons without authentication

## Deploy
Deploy the whole folder to the existing Netlify site. No ESPN credentials are required for the current public-season feed. If using AI article generation, set `OPENAI_API_KEY` in Netlify environment variables and redeploy.

Historical ESPN access can be more restricted than current public-season access. The history function will load every season ESPN advertises as available, skip seasons it cannot read, and clearly report that limitation instead of inventing lifetime records.
