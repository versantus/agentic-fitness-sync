import { loadPassword, loadToken, saveToken } from './config.js';
const BASE = 'https://api.trainerize.com/v03/';
const MIN_INTERVAL_MS = 350; // be a polite, human-paced client
const USER_AGENT = 'agentic-fitness-sync/0.1 (personal data export; unofficial)';
export class AuthError extends Error {
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function jwtExpiry(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        if (typeof payload.exp === 'number')
            return payload.exp * 1000;
    }
    catch { /* opaque token */ }
    return Date.now() + 60 * 60 * 1000;
}
let lastRequest = 0;
async function rawPost(path, body, token) {
    const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
    if (wait > 0)
        await sleep(wait);
    lastRequest = Date.now();
    return fetch(BASE + path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });
}
/** Log in the same way the Trainerize web app does: email + password + the coach's subdomain. */
export async function login(email, password, subdomain) {
    const res = await rawPost('user/login', { email, password, groupUrl: subdomain, rememberMe: true });
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    }
    catch {
        throw new AuthError(`Login failed: HTTP ${res.status}`);
    }
    // The response is sometimes wrapped in { data: ... }.
    const d = data?.token ? data : (data?.data ?? data);
    const accessToken = d?.token?.access_token ?? d?.token?.accessToken ?? d?.accessToken;
    const userID = Number(d?.userid ?? d?.userID ?? d?.token?.userID);
    if (!res.ok || !accessToken || !userID) {
        const msg = d?.message ?? data?.message ?? `HTTP ${res.status}`;
        const code = d?.code ?? data?.code;
        throw new AuthError(`Login failed: ${msg}${code !== undefined ? ` (code ${code})` : ''}`);
    }
    return { accessToken, userID, expiresAt: jwtExpiry(accessToken) };
}
export class TrainerizeClient {
    cfg;
    token = null;
    constructor(cfg) {
        this.cfg = cfg;
        const cached = loadToken();
        if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000)
            this.token = cached.accessToken;
    }
    get userID() { return this.cfg.userID; }
    async refresh() {
        const password = loadPassword(this.cfg.email);
        if (!password)
            throw new AuthError('Session expired and no stored password. Run `trainerize login` again.');
        const r = await login(this.cfg.email, password, this.cfg.subdomain);
        saveToken({ accessToken: r.accessToken, expiresAt: r.expiresAt });
        this.token = r.accessToken;
        return r.accessToken;
    }
    /** POST to a v03 endpoint with auth, re-login on 401, and backoff on 429/5xx. */
    async post(path, body) {
        let token = this.token ?? await this.refresh();
        let reauthed = false;
        for (let attempt = 0; attempt < 5; attempt++) {
            const res = await rawPost(path, body, token);
            if (res.status === 401 && !reauthed) {
                reauthed = true;
                token = await this.refresh();
                continue;
            }
            if (res.status === 429 || res.status >= 500) {
                const retryAfter = Number(res.headers.get('retry-after'));
                const backoff = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt + Math.random() * 500;
                await sleep(backoff);
                continue;
            }
            const text = await res.text();
            if (!res.ok)
                throw new Error(`${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
            const json = JSON.parse(text);
            // Errors are sometimes reported in-band as { code: 4xx, message }.
            if (typeof json?.code === 'number' && json.code >= 400)
                throw new Error(`${path}: ${json.message ?? 'error'} (code ${json.code})`);
            return json;
        }
        throw new Error(`${path}: gave up after repeated throttling/server errors`);
    }
}
