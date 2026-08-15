// Env loading, duplicated per service on purpose — see CLAUDE.md. This is the
// Node port of the load_env_file/require_env pair at webhook_new.py:20-39,
// which is copy-pasted into standup.py, service_registry.py, pc-deck-agent.py
// and ideas/server.py so each service runs standalone. Do not refactor it into
// a shared module.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Real environment variables win over the file, matching the Python version.
function loadEnvFile(file) {
    if (!fs.existsSync(file)) return;
    for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;
        const idx = line.indexOf('=');
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (key && !(key in process.env)) process.env[key] = value;
    }
}

function requireEnv(name) {
    const value = process.env[name];
    if (value === undefined || value === '') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

// The repo root .env, one level up from work-log-tool/.
loadEnvFile(path.join(__dirname, '..', '..', '.env'));
// A service-local override, if one ever exists. Loaded second, but the
// first-wins rule above means the repo root still takes precedence.
loadEnvFile(path.join(__dirname, '..', '.env'));

// "~/work-logs.sqlite" in a .env is a literal tilde to Node, unlike os.path.expanduser.
function expandHome(p) {
    if (!p) return p;
    if (p === '~') return os.homedir();
    if (p.startsWith('~/') || p.startsWith('~\\')) {
        return path.join(os.homedir(), p.slice(2));
    }
    return p;
}

module.exports = { loadEnvFile, requireEnv, expandHome };
