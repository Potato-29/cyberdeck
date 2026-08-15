// One shared secret, same as the rest of the legacy deck services: WEBHOOK_TOKEN
// checked against ?token= or X-Token (webhook_new.py:100-102). Bearer is added
// on top because it is what the ESP32 firmware sends, and ?token= is kept
// because the HTML page reads the token off its own URL — see the apiUrl()
// helper in public/work.html and the CLAUDE.md rule about never baking a secret
// into markup.

const crypto = require('node:crypto');

const SECRET = process.env.WEBHOOK_TOKEN || '';

function tokenFrom(req) {
    const header = req.get('authorization') || '';
    if (header.startsWith('Bearer ')) return header.slice(7).trim();
    return req.get('x-token') || req.query.token || '';
}

// Hash both sides first: timingSafeEqual throws on a length mismatch, and
// comparing raw tokens would leak the secret's length through that throw.
function tokenMatches(candidate) {
    if (!SECRET) return false;
    const a = crypto.createHash('sha256').update(String(candidate)).digest();
    const b = crypto.createHash('sha256').update(SECRET).digest();
    return crypto.timingSafeEqual(a, b);
}

function requireToken(req, res, next) {
    if (!SECRET) {
        // Refuse rather than run open. Without this an unset WEBHOOK_TOKEN would
        // make '' === '' true and expose every write endpoint on a public
        // subdomain. Same reasoning as the bool(SECRET) guard in standup.py:548.
        return res.status(503).json({ error: 'WEBHOOK_TOKEN is not set; refusing to serve' });
    }
    if (!tokenMatches(tokenFrom(req))) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
}

module.exports = { requireToken, tokenFrom, tokenMatches, SECRET };
