const { query } = require('../db');

// FTS5 treats a bare query as a match expression, so an unbalanced quote or a
// stray "NEAR" from ordinary typing raises SQLITE_ERROR mid-search. Wrapping
// each token as a quoted phrase with a trailing * makes any input a valid
// prefix search — the same defensive posture as the ESCAPE handling in
// ideas/server.py:347-353, for a different query language.
function toMatchExpr(raw) {
    const tokens = raw.match(/[\p{L}\p{N}_]+/gu) || [];
    return tokens.map((t) => `"${t}"*`).join(' ');
}

module.exports = {
    search: (req, res) => {
        const q = (req.query.q || '').trim();
        if (!q) return res.json({ results: [], query: q });

        const expr = toMatchExpr(q);
        if (!expr) return res.json({ results: [], query: q });

        const results = query(
            `SELECT n.id, n.timestamp, n.raw_text, n.source, n.status,
                    c.name AS context_name,
                    -- Control chars as highlight delimiters, not brackets: notes
                    -- are full of stack traces and "[0]" would highlight itself.
                    snippet(notes_fts, 0, char(2), char(3), '…', 12) AS snippet
               FROM notes_fts
               JOIN notes n ON n.id = notes_fts.rowid
               LEFT JOIN contexts c ON c.id = n.context_id
              WHERE notes_fts MATCH ?
              ORDER BY rank
              LIMIT 200`,
            expr,
        );
        return res.json({ results, query: q });
    },
};
