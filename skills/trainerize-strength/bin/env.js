import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Load .env files, first match per key wins and real environment variables beat all of them:
//   1. ./.env (current directory)
//   2. the repo root, when running from a clone (…/skills/trainerize-strength/bin → repo)
//   3. the skill folder itself (installed plugin / copied skill)
//   4. ~/.trainerize/.env — the natural place when installed as a Claude plugin
// Imported first by cli.ts so TRAINERIZE_HOME is set before config.ts reads it.
const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(skillDir, '..', '..');
const candidates = [
    resolve('.env'),
    ...(existsSync(join(repoRoot, 'package.json')) ? [join(repoRoot, '.env')] : []),
    join(skillDir, '.env'),
    join(homedir(), '.trainerize', '.env'),
];
for (const file of new Set(candidates)) {
    if (existsSync(file))
        process.loadEnvFile(file);
}
