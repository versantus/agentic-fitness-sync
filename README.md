# agentic-fitness-sync

Sync your own [ABC Trainerize](https://www.trainerize.com) workout history to your machine,
then ask Claude about it or open a local strength dashboard. It covers estimated 1RM progression,
PRs, weekly volume by muscle group (including a front/back body map) and consistency.

> **Unofficial.** Not affiliated with or endorsed by ABC Trainerize or ABC Fitness. It uses the
> same private API the Trainerize web app uses, signed in as you, and reads only your own
> account. That API is undocumented and may change or break at any time. Automated access may
> also be restricted by Trainerize's terms of service, so use it at your own discretion and only for
> your own data. It never writes to your account.

## Why

Trainerize's official API is only available to Studio and Enterprise business accounts, and it
doesn't include set-by-set data. As a client you only have a web login. This tool signs in with
that login and downloads your logged workouts, including every set's reps and weight.

## Install

Pick one of these. All of them need Node.js 20.12 or newer, and none needs `npm install` to run.

**As a Claude Code plugin** (recommended):

```
/plugin marketplace add versantus/agentic-fitness-sync
/plugin install agentic-fitness-sync@agentic-fitness-sync
```

**As a plain skill:** copy `skills/trainerize-strength/` to `~/.claude/skills/`. The folder is
self-contained, with the compiled CLI in `bin/` and the dashboard in `dashboard/`.

**As a CLI, without Claude:**

```sh
git clone https://github.com/versantus/agentic-fitness-sync && cd agentic-fitness-sync
npm link    # optional: puts `trainerize` on your PATH (otherwise use: node skills/trainerize-strength/bin/cli.js)
```

## Use

First, log in **in your own terminal**. It prompts for your password, which Claude never sees.

```sh
trainerize login     # prompts for email, your coach's web address and password
trainerize sync      # first run downloads your full history; later runs fetch only what's new
trainerize serve     # dashboard at http://127.0.0.1:4477
```

With the plugin installed, you can then just ask Claude things like *"how's my deadlift trending?"*
or *"show my strength dashboard"*.

To skip typing your email and web address, put them in a `.env` file. The CLI looks in the current
directory, the repo root and `~/.trainerize/.env`:

```sh
cp .env.example ~/.trainerize/.env   # then set TRAINERIZE_EMAIL and TRAINERIZE_URL
```

| Command | What it does |
|---|---|
| `trainerize status` | Shows the account, data folder, last sync and cache size |
| `trainerize stats [--exercise squat] [--weeks 12] [--top 10]` | JSON summary for scripts or Claude |
| `trainerize export [--format csv\|json] [--out sets.csv]` | One row per logged set |
| `trainerize sync --full` | Re-downloads everything |
| `trainerize logout` | Removes the stored password and session (keeps the cache) |

If you sign in to Trainerize with Google, Apple or Facebook rather than a password, set a password
for your account in the Trainerize app first.

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
