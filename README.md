# PickleLive 🥒⚡

Real-time pickleball tournament and live scoring for **team-vs-team** events. Every fixture is a **tie** (Team A vs Team B) made of several category matches (U18 Mixed, Men's Doubles, Open Singles…). Admins define everything: categories, tie formats, teams, players, stages and schedule. Referees score from a phone with a secret link. Fans, and a big screen at the venue, follow every point live.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ayushgupta2056/Picklelive--scoring/tree/ccr-a9246ca8-0jdx7m)

🎬 Silent demo video: [`docs/picklelive-demo.mp4`](docs/picklelive-demo.mp4) (2:06)

One Render web service (Node 20 + Express + Socket.IO, which also serves the React app) plus PostgreSQL.

---

## Contents
- [Features](#features)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Deploy to Render](#deploy-to-render-step-by-step)
- [Running a tournament](#running-a-tournament)
- [Architecture](#architecture)
- [Testing](#testing)
- [Defaults I chose](#defaults-i-chose)

---

## Features

**Access levels**
- **Admin** (`/admin`): email and password from env (bcrypt), JWT in an httpOnly cookie. Full control.
- **Referee** (`/ref/:matchId?token=…`): a random 32-character token per match. It is stored hashed (plus an encrypted copy so the admin can show the link again). It works for that one match only. The admin can copy it, show a QR code, regenerate it or revoke it. Revoking disconnects the referee's socket instantly.
- **Public** (`/t/:slug`): live home, schedule, standings, brackets, teams, players and category leaders. Also `/t/:slug/tie/:id`, `/t/:slug/match/:id` and the big-screen `/t/:slug/tv`.

**Teams, categories, ties**
- Categories: format, gender rule (Any / Men / Women / Mixed 1M+1F), age rule (Under X / X+ / range, checked on the tournament's age cutoff date), optional DUPR range, default scoring, badge color. You can add, edit, clone, reorder and add presets.
- Tie formats: an ordered list of category slots with weights and an optional decider slot. Also set per format:
  - what happens on a level tie: decider or draw;
  - early stop once the tie is decided: remaining matches become "not required", or are played as dead rubbers;
  - the per-player usage limit and whether a pair may repeat;
  - roster min and max, and blind lineups.
- Each tie can override its own slots: add, remove or reorder.
- Stages: round-robin groups (circle method, optional double round), seeded knockout (byes, third-place tie, drag-to-reseed, fill from group standings with cross seeding), or both.

**Lineups at match time**
- For each slot, pick players from that team's roster (uploaded once by the admin). Ineligible players are greyed out with the reason, such as "Over 17 on cutoff date", "Mixed needs 1M + 1F", "Already used in 2 categories this tie" or "Not in roster".
- The admin can force an override with a mandatory reason, which goes to the audit log.
- The referee enters lineups from **dropdowns**, one per player spot, and picks the **court**.
- A match can't start until both lineups are in. Lineups lock automatically at the first serve, and the admin can unlock them. Optional blind lineups.

**Scoring engine** (`shared/scoring`)
- Event-sourced and pure TypeScript: `state = replay(events)`. This gives perfect multi-level **undo**, crash recovery and an audit trail. The server is the source of truth.
- Follows USA Pickleball rules:
  - Side-out doubles: the game starts at 0-0-2, players' positions are tracked explicitly, partners swap on a point, and server #1 → server #2 → side out.
  - Side-out singles: serve side follows the server's score parity (right when even).
  - Rally scoring (2026 rules): the receiver can win on game point, with no freeze.
- Also handles: win by 2, point caps, best of 1, 3 or 5, ends switching after each game and at 6, 8 or 11 in the deciding game, timeouts with countdown, medical timeouts (once per player), warnings, technical fouls and faults, retire / forfeit / walkover, a manual end of game, and admin result correction.
- Flags and stats: GAME POINT and MATCH POINT badges, points on serve and receive, side outs, longest run, lead changes, and a point-by-point timeline.

**Referee screen** (mobile-first, one hand)
- Pre-match wizard: court and lineups → coin toss → sides → right-court players → START.
- Live screen:
  - the court diagram puts each team in its own vertical column, players in their **actual** positions, and a glowing ball on the server;
  - the score call is huge ("4-2-1");
  - two giant buttons in team colors, each directly under its team's column;
  - a big UNDO button.
- Confirmation only on game- and match-ending rallies, plus a 3-second "Undo" toast after every action. Haptics, optional sounds, Wake Lock, and both portrait and landscape layouts.
- **Offline-tolerant:** events queue in IndexedDB, a red bar shows "Offline – N events queued", and they sync in order on reconnect. The server dedupes by idempotency key and rejects out-of-order sequence numbers.
- After the match: a summary and "Submit final". The admin can still correct the result.

**Public and TV**
- Live updates over Socket.IO: score changes are patched in place, and anything structural triggers a refetch. Every reconnect re-fetches the full state, so nobody sees a stale score.
- The match page has a scoreboard, game-by-game scores, a momentum chart, a point timeline, lineups and stats.
- The standings table shows P, W, D, L, Matches W-L, Games W-L, PF, PA, PD and Tie Pts. Tiebreaks are configurable (head-to-head is computed as a mini-league), and the qualification zone is highlighted.
- **Big display** (admin → Big display) controls what `/t/:slug/tv` shows, pushed live:
  - **All live ties**: every A-vs-B tie with each category match, courts and player photos. The layout scales to the number of ties.
  - **One team**: that team's current tie.
  - **One tie**: a specific tie, full screen.
  - **Rotate**: live ties one at a time.
- Share buttons with QR codes for tournaments, ties and matches. The app is a PWA and can be installed.

**Admin extras**: a drag-and-drop schedule board (court × time) with conflict warnings (player double-booked, court overlap, rest gap), auto-scheduling, CSV player import with a template and a row-by-row error report, client-side photo resizing, CSV export of standings and results, a printable schedule, and a full audit log.

---

## Local setup

Requirements: Node 20+ and PostgreSQL 14+ (local, Docker, Neon or Supabase).

```bash
git clone <this repo> && cd Picklelive--scoring
cp .env.example .env          # edit DATABASE_URL / admin credentials
npm install
npx prisma migrate dev        # creates tables
npm run db:seed               # demo tournament "PickleLive Demo Cup" (/t/demo-cup)
npm run dev                   # API on :3000, Vite on :5173 (proxied)
```

Open http://localhost:5173. Sign in as admin at `/admin` with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults `admin@picklelive.local` / `changeme123`).

Quick Postgres with Docker:
```bash
docker run -d --name pl-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=picklelive -p 5432:5432 postgres:16
```

Production build locally:
```bash
npm run build && npm start     # http://localhost:3000
```

**Seed contents:**
- 1 tournament with all category presets.
- A 5-slot tie format: U18 Mixed, MD, WD, XD, and Open Singles as the decider.
- 6 teams × 8 players, with mixed ages (some U18, some 35+) and genders.
- 2 groups with generated ties. One tie is in progress: 2 matches done, 1 **live** mid-game, 2 upcoming. One tie is finished.
- An empty knockout stage ready to fill.

---

## Environment variables

| Name | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (Render, Neon, Supabase…). |
| `ADMIN_EMAIL` | yes (prod) | Admin login email. |
| `ADMIN_PASSWORD` | yes (prod) | Admin password. It is bcrypt-hashed at boot and never stored. |
| `JWT_SECRET` | yes (prod) | Long random string. It signs the admin cookie and derives the key that encrypts ref tokens. Changing it signs everyone out and invalidates the displayable copies of ref links (regenerate them). |
| `APP_ORIGIN` | no | Public origin, e.g. `https://scores.example.com`. Used for CORS and cross-origin request blocking. On Render, `RENDER_EXTERNAL_URL` is used automatically. |
| `PORT` | no | Defaults to 3000 (Render sets it). |
| `NODE_ENV` | no | `npm start` sets `production` (secure cookies, strict env checks). |

---

## Deploy to Render (step by step)

The repo includes a **Blueprint** (`render.yaml`) that creates a Postgres database and a web service.

1. Push this repo to GitHub.
2. In Render, go to **New → Blueprint**, pick the repo and click **Apply**.
3. When prompted, fill in `ADMIN_EMAIL` and `ADMIN_PASSWORD`. `JWT_SECRET` is generated for you. Leave `APP_ORIGIN` empty unless you use a custom domain.
4. Render runs:
   - build: `npm ci --include=dev && npx prisma migrate deploy && npm run build`
   - start: `npm start`
   - health check: `GET /healthz` (also checks the database)
5. Open the service URL, then `/admin`, and sign in.
6. Optional demo data: in the service's **Shell** tab run `npm run db:seed`.

Using **Neon** or **Supabase** instead of Render Postgres: delete the `databases:` block in `render.yaml`. Then set `DATABASE_URL` manually as a secret env var, using the pooled connection string with `?sslmode=require`.

Custom domain: add it in Render, then set `APP_ORIGIN=https://your.domain`.

> ⚠️ **Plans matter on match day.**
> - Render's **free web service sleeps when idle**. That means cold starts of 30–60 s and **dropped WebSocket connections**, so referees and TVs would disconnect. Use the **Starter** plan (or higher) for events. `render.yaml` defaults to `starter`.
> - Render's **free Postgres expires** after a limited period and is deleted. For real events use a paid Render database (`basic-256mb` in `render.yaml`) or a Neon or Supabase database.

---

## Running a tournament

1. **Create the tournament** (Admin → New tournament). Set the **age cutoff date** carefully: U18 means "under 18 on that date". A player whose 18th birthday is on the cutoff date is *not* U18.
2. **Categories** (Admin → Categories). Use the presets or create your own: name, short code, singles or doubles, gender rule, age rule, optional DUPR range and default scoring (side-out or rally, 11/15/21, best of 1/3/5, timeouts, switch-ends point). You can clone and reorder them with the arrows. Any single match can override the scoring rules (Ties → match → *Scoring rules*).
3. **Tie formats** (Admin → Tie formats). Add slots in order and drag to reorder. Give a slot more than 1 point to weight it, and tick *Decider* for a slot that is played only if the tie is level. Then choose:
   - level-tie policy: decider or draw;
   - early stop: remaining matches become "not required", play dead rubbers, or play everything;
   - max categories per player, whether pairs may repeat, roster size and blind lineups.

   Make one the default, or pick a format per stage.
4. **Teams and players**. Add teams (name, 3-letter code, color, logo). Add players one by one or with **Import CSV**: download the template, paste or upload, click *Check rows* to see a row-by-row report, then *Import valid rows*.
5. **Stages** (Admin → Stages). Add a round-robin stage, create groups, add teams (or *Split teams evenly*) and click **Generate ties**. For the knockout, add a knockout stage. Either *Fill from standings* (A1 v B2, B1 v A2…) or add seeds manually and drag to reseed, then generate. Winners flow into the next round automatically.
6. **Schedule** (Admin → Schedule). Click *Auto-schedule*, then drag matches between courts and times. Warnings show double-booked players, court overlaps and short rest gaps. *Printable* opens a print-ready schedule.
7. **Lineups** (Admin → Ties & lineups → a tie). For each slot, pick each team's players. Ineligible players show why. Click a blocked player to **override** with a reason. Lock or unlock per team.
8. **Referee links**. On each match card use *Copy ref link*, show the **QR code** for the referee to scan, *Regenerate* (the old link dies) or *Revoke* (the connected referee is kicked instantly). Referees need no account. A link can only score its own match.
9. **Big screen**. Open `/t/<slug>/tv` on the venue TV (press the full-screen button). Then pick the view from **Admin → Big display**: all live ties, one team, one tie, or rotate. You can force a view on a particular TV with `?team=<teamId>` or `?tie=<tieId>`.
10. **During play**:
    - pause or resume a match;
    - award a walkover;
    - record a retirement;
    - enter or correct a final score;
    - reset a match (its events are kept in the audit log).

    Everything is in **Admin → Audit log**.
11. **Export**: Admin → Settings → *Standings CSV* / *Results CSV*.

---

## Architecture

```
shared/                 pure TS, used by server AND client
  scoring/engine.ts     event-sourced rally engine (replay, undo, flags, stats)
  tie/tieEngine.ts      tie score, weights, early stop, decider/draw
  eligibility/          category rules × DOB/gender/skill × usage limits × overrides
  tournament/           round-robin + bracket generation, standings, schedule conflicts
  csv.ts, presets.ts, api.ts (DTOs)
server/                 Express + Socket.IO + Prisma
  services/matchService.ts  transactional event append (row lock, idempotency, seq check), tie recompute, KO propagation
  routes/{public,ref,admin}.ts
client/                 React + Vite + Tailwind + shadcn-style UI + Framer Motion + TanStack Query
prisma/                 schema, migrations, seed
```

- **Source of truth:** clients send only intents ("rally won by A", timeout…). The server appends the event inside a transaction with `SELECT … FOR UPDATE` on the match. It rejects stale sequence numbers, dedupes idempotency keys, replays with the engine, and stores `cachedState` for fast reads. `cachedState` can always be rebuilt from `ScoreEvent`.
- **Realtime:** rooms per tournament (`t:`), tie (`tie:`) and match (`match:`). Public sockets can only join whitelisted rooms and cannot write. Referee sockets authenticate with their match token.
- **Security:**
  - helmet with a strict CSP;
  - rate limits on login, referee and admin endpoints;
  - state-changing requests from foreign origins are blocked;
  - httpOnly SameSite cookies;
  - ref tokens hashed;
  - zod validation on every input;
  - private fields (DOB, phones, manager contact) never leave the admin API. Public pages show only age groups.
- **Images** are resized in the browser and stored in Postgres, because Render's disk is ephemeral.

---

## Testing

```bash
npm test              # 85 Vitest unit tests (engine, tie, eligibility, fixtures, standings, conflicts, CSV, tokens)
npm run lint          # ESLint + tsc --noEmit
npm run test:e2e      # Playwright end-to-end (starts `npm start` if nothing runs on :3000; needs a built app + DB)
```

The end-to-end test runs the whole flow:
1. The admin creates categories, a tie format, teams and players (CSV with a bad row), then generates ties.
2. The admin enters lineups and checks that ineligible players are blocked ("Over 17 on cutoff date", "Mixed needs 1M + 1F").
3. A referee on a Pixel 7 viewport picks the court, runs the wizard and scores a full best-of-3. This includes an **undo across a side out** and the switch-ends banner.
4. The admin enters the second match's result.
5. A second browser checks that the public tie page and standings updated live, without reloading.

---

## Design system

The viewing screens follow an OLED-dark "sports broadcast" style built with the UI/UX Pro Max skill's guidance:
- **Type:** Barlow Condensed for scores, team names and headings (`font-display`, `score-display`); Inter for body text.
- **Color:** a single electric-lime accent (#C6FF00) with a restrained glow, and team colors as washes.
- **Contrast:** at least 4.5:1, and 7:1 on the TV display.
- **Motion:** 150–300 ms transitions and staggered entrances, all switched off under reduced motion.
- **Shared utilities** (`surface`, `eyebrow`, `hover-lift`, `text-glow`) live in `client/src/index.css`.

## Defaults I chose

- Timezone `Asia/Kolkata`; age cutoff Jan 1 of the tournament year.
- Scoring defaults: **one game (set) to 11**, side-out (serve) scoring, win by 2, no point cap. Change the number of games (1, best of 3, best of 5) and points (11/15/21) per category, or per match. Admins use the Games/Points picker on each match card; referees use the START step of the wizard. Either way, only before the first serve. Timeouts: 2 per game (3 for games to 21), 60 s each. Switch ends at 6 / 8 / 11 in the deciding game. Medical timeout: 15 minutes, once per player per match.
- Tie points: win 2, draw 1, loss 0. Tiebreaks: tie points → head-to-head (mini-league among the tied teams) → match diff → game diff → point diff → points scored.
- Tie formats: level tie plays the decider; stop early with remaining matches marked "not required"; max 2 categories per player per tie; pairs may not repeat.
- Match slot 30 minutes, rest-gap warning under 15 minutes, 4 courts.
- After each game the team that received first in the previous game serves first. Players start each new game in the same positions as the previous game's start. The referee can swap them before the first rally.
- Warnings and technical fouls are **recorded** (log and match page) but don't change the score automatically. Use *End game* or *Enter result* if a sanction awards a game.
- The referee court diagram is drawn from the net post: each team in its own vertical column. The wizard asks which team is on the referee's left.
- Rally-scoring doubles uses one server per side out, and the call is two numbers.
- Public pages show age groups only (U14 / U18 / Open / 35+ / 50+), never DOB or phone.
- Uploads are stored in Postgres, at most about 1.5 MB after resizing.
