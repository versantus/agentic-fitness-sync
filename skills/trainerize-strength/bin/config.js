import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
export const HOME = process.env.TRAINERIZE_HOME ?? join(homedir(), '.trainerize');
export const CACHE_DIR = join(HOME, 'cache');
export const WORKOUT_DIR = join(CACHE_DIR, 'workouts');
const CONFIG_FILE = join(HOME, 'config.json');
const TOKEN_FILE = join(HOME, 'token.json');
export function ensureDirs() {
    for (const d of [HOME, CACHE_DIR, WORKOUT_DIR])
        mkdirSync(d, { recursive: true, mode: 0o700 });
}
export function loadConfig() {
    if (!existsSync(CONFIG_FILE))
        return null;
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
}
export function saveConfig(cfg) {
    ensureDirs();
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    chmodSync(CONFIG_FILE, 0o600);
}
export function requireConfig() {
    const cfg = loadConfig();
    if (!cfg)
        throw new Error('Not logged in. Run `trainerize login` first.');
    return cfg;
}
// ---- Secrets ---------------------------------------------------------------
// On macOS the password lives in the login Keychain. Elsewhere we never persist
// the password: supply TRAINERIZE_PASSWORD, or re-run `trainerize login`.
const SERVICE = 'agentic-fitness-sync';
const isMac = process.platform === 'darwin';
/** Quote a value for `security -i`'s command parser. */
const q = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
export function savePassword(email, password) {
    if (!isMac)
        return false;
    if (/[\r\n]/.test(password + email))
        throw new Error('Email/password must not contain line breaks.');
    // Pipe the command over stdin so the password never appears in the process list (`ps`).
    execFileSync('security', ['-i'], { input: `add-generic-password -U -s ${q(SERVICE)} -a ${q(email)} -w ${q(password)}\n`, stdio: ['pipe', 'ignore', 'ignore'] });
    return true;
}
export function loadPassword(email) {
    if (process.env.TRAINERIZE_PASSWORD)
        return process.env.TRAINERIZE_PASSWORD;
    if (!isMac)
        return null;
    try {
        return execFileSync('security', ['find-generic-password', '-s', SERVICE, '-a', email, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch {
        return null;
    }
}
export function deletePassword(email) {
    if (!isMac)
        return;
    try {
        execFileSync('security', ['delete-generic-password', '-s', SERVICE, '-a', email], { stdio: 'ignore' });
    }
    catch { /* not present */ }
}
export function loadToken() {
    if (!existsSync(TOKEN_FILE))
        return null;
    try {
        return JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
    }
    catch {
        return null;
    }
}
export function saveToken(t) {
    ensureDirs();
    writeFileSync(TOKEN_FILE, JSON.stringify(t), { mode: 0o600 });
    chmodSync(TOKEN_FILE, 0o600);
}
export function clearToken() {
    rmSync(TOKEN_FILE, { force: true });
}
