# agentic-fitness-sync

Download your own [ABC Trainerize](https://www.trainerize.com) workout history to your computer.
Then ask an AI assistant about it ("what's my deadlift 5RM?", "am I training legs enough?"), or open a
local strength dashboard. The dashboard shows estimated 1RM trends, rep maxes, PRs, weekly volume by
muscle group, a front/back body map and your consistency, with search and a page for every
exercise and muscle.

> **Unofficial.** Not affiliated with or endorsed by ABC Trainerize or ABC Fitness. It uses the
> same private API the Trainerize web app uses, signed in as you, and reads only your own
> account. That API is undocumented and may change or break at any time. Automated access may
> also be restricted by Trainerize's terms of service, so use it at your own discretion and only for
> your own data. It never writes to your account.

## Quick start (5 minutes)

You need [Node.js](https://nodejs.org) 20.12 or newer. Check with `node --version`.

```sh
# 1. Get it
git clone https://github.com/versantus/agentic-fitness-sync
cd agentic-fitness-sync
npm link                 # adds a `trainerize` command (optional, but the rest of this guide uses it)

# 2. Log in: asks for your email, your coach's Trainerize web address and your password
trainerize login

# 3. Download your history (the first run takes a minute or two; after that, seconds)
trainerize sync

# 4. Open the dashboard in your browser
trainerize serve
```

- **Without `npm link`:** use `node skills/trainerize-strength/bin/cli.js` wherever this guide says `trainerize`.
- **Web address:** the one you use to log in on the web, e.g. `https://yourcoach.trainerize.com`.
- **Social login:** if you sign in with Google, Apple or Facebook, set a password in the Trainerize app first.

## Use it with an AI agent

The tool keeps your data on your computer and gives an agent two ways in. `trainerize stats` prints a
JSON summary, and `trainerize export` writes every set you've logged to a file. How you connect an
agent depends on whether it can run commands on your machine.

| Agent | How | Can it sync by itself? |
|---|---|---|
| **Claude Code** (terminal, desktop or IDE) | Install the plugin, then just ask | ✅ Yes |
| **ChatGPT Codex CLI**, Gemini CLI, Cursor, other coding agents | Open the repo folder; they read `AGENTS.md` | ✅ Yes |
| **ChatGPT**, **Claude.ai**, **Grok** (web or mobile apps) | Export a file and upload it to the chat | ❌ Re-export when you want fresher data |

### Claude Code (recommended)

Run these in Claude Code:

```
/plugin marketplace add versantus/agentic-fitness-sync
/plugin install agentic-fitness-sync@agentic-fitness-sync
```

Log in once in your own terminal (`trainerize login`), and then just ask:

- *"Sync my Trainerize data and tell me how my squat has progressed this year."*
- *"What's my deadlift 1RM and 5RM?"*
- *"Which muscle groups have I neglected in the last 3 months?"*
- *"Show me my strength dashboard."*

Claude runs the bundled CLI itself and can link you straight to a dashboard page. It never asks for
your password. When a login is needed, it tells you the command to run.

**Without the plugin system:** copy the self-contained skill folder into your skills directory instead:
`cp -r skills/trainerize-strength ~/.claude/skills/`

### ChatGPT Codex CLI and other terminal agents

Start the agent inside the cloned folder (e.g. `cd agentic-fitness-sync && codex`). Codex, and most
other coding agents, automatically read [`AGENTS.md`](AGENTS.md), which tells them how to run the CLI
and answer from your data. Log in yourself first with `trainerize login`, then ask the same kinds of questions.

### ChatGPT, Claude.ai or Grok in the browser or app

These can't run programs on your computer, so give them a file instead:

```sh
trainerize sync
trainerize stats --top 25 --weeks 52 > my-training-summary.json   # small; good for most questions
trainerize export --out my-sets.csv                                # every set; for detailed analysis
```

Upload one of the files to a new chat and start with something like:

> This is my strength training history exported from Trainerize. Weights are in kg. `e1rm` is an
> Epley estimated 1-rep max, and `repMaxes` is the heaviest weight I've lifted for at least N reps.
> What's my deadlift 5RM, and how has my squat progressed over the last year?

Uploading sends that file to the AI provider (OpenAI, Anthropic or xAI) under their data policies.
The summary file is smaller and contains less detail than the full export.

## Commands

| Command | What it does |
|---|---|
| `trainerize login` | Signs in. The password goes to the macOS Keychain for automatic re-login |
| `trainerize sync [--full]` | Fetches new workouts (`--full` re-downloads everything) |
| `trainerize serve [--port 4477] [--no-open]` | Local dashboard |
| `trainerize stats [--exercise squat] [--weeks 12] [--top 10]` | JSON summary: bests, rep maxes, recent sessions, PRs, weekly volume |
| `trainerize export [--format csv\|json] [--out file]` | One row per logged set |
| `trainerize status` | Shows the account, data folder, last sync and cache size |
| `trainerize logout` | Removes the stored password and session (keeps your data) |

**Skip retyping your details:** put your email and web address in a `.env` file. It's read from the current folder,
the repo folder or `~/.trainerize/.env`:

```sh
cp .env.example ~/.trainerize/.env   # then edit TRAINERIZE_EMAIL and TRAINERIZE_URL
```

**Dashboard links:** `http://127.0.0.1:4477/#/exercise/<id>` and `http://127.0.0.1:4477/#/muscle/<group>`
(e.g. `chest`, `shoulders`, `hamstrings`). Press `/` on the dashboard to search.

## Why this exists

Trainerize's official API is only available to Studio and Enterprise business accounts, and it
doesn't include set-by-set data. As a client you only have a web login. This tool signs in with
that login and downloads your logged workouts, including every set's reps and weight.

## Security and privacy

- **Password:** stored in the macOS login Keychain (service `agentic-fitness-sync`). It's passed
  over stdin, never on the command line, and used only to sign in again when the session expires.
  On Linux and Windows it isn't stored: set `TRAINERIZE_PASSWORD` in your shell, or re-run `login`.
- **Session token:** `~/.trainerize/token.json` (mode 600). It expires within hours.
- **Workout cache:** plain JSON in `~/.trainerize/cache/`. Set `TRAINERIZE_HOME` to use a different folder.
- **Dashboard server:** binds to `127.0.0.1` only. It rejects requests with a foreign `Host` (DNS
  rebinding) or `Origin` (cross-site requests), and a sync must come from the dashboard page itself.
- **Network:** nothing is sent anywhere except `api.trainerize.com`. The dashboard also loads the
  Outfit and Open Sans fonts from Google Fonts.
- **CSV export:** cells that would start a spreadsheet formula (`= + - @`) are prefixed with `'`.
- **Skill:** Claude is told to treat exercise names and notes as data, never as instructions.
- **Dependencies:** none at runtime. TypeScript is the only dev dependency.

Found a vulnerability? Please open a private security advisory on GitHub rather than a public issue.

## How the numbers are calculated

- **e1RM:** Epley, `weight × (1 + reps / 30)`, from sets of 10 reps or fewer, taking the best set
  of each session.
- **PR:** a session whose best e1RM, or heaviest weight, beats every earlier session of that exercise.
- **Volume:** logged sets and tonnage (weight × reps), grouped by Trainerize's "main muscle" tag.
  Bodyweight sets count as sets but add no tonnage.
- **Body map:** sets per muscle in the selected range, on a 4-step square-root scale. Muscles that
  aren't on the map are still listed in the table beside it.
- **Streak:** consecutive Monday-start weeks with at least one tracked strength workout.
- **Adherence:** tracked workouts vs scheduled workouts left unticked, over the last 12 weeks.

## Development

```sh
npm install      # builds into skills/trainerize-strength/bin (committed, so the skill works without a build)
npm test         # unit and security tests
```

CI checks that the committed `bin/` matches `src/`. Run `npm run build` before committing.

## Being a good citizen

Requests go one at a time, at least 350 ms apart, with backoff on errors. A normal incremental
sync is a handful of requests. Please don't remove these limits.

## License

MIT
