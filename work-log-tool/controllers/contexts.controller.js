const { query, one, execute, now } = require('../db');

const activeId = () => one('SELECT active_context_id FROM app_state WHERE id = 1')?.active_context_id ?? null;

const lastBreadcrumb = (contextId) => one(
    'SELECT id, text, timestamp FROM breadcrumbs WHERE context_id = ? ORDER BY timestamp DESC LIMIT 1',
    contextId,
);

module.exports = {
    getAllContexts: (req, res) => {
        const active = activeId();
        const rows = query(
            `SELECT c.id, c.name, c.created, c.is_archived, c.last_touched,
                    (SELECT COUNT(*) FROM notes n WHERE n.context_id = c.id) AS note_count
               FROM contexts c
              WHERE c.is_archived = 0
              ORDER BY c.id`,
        );
        const contexts = rows.map((row) => ({
            ...row,
            is_active: row.id === active,
            last_breadcrumb: lastBreadcrumb(row.id),
        }));
        return res.json({ contexts, active_context_id: active });
    },

    addContext: (req, res) => {
        const name = (req.body?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'name is required' });
        const ts = now();
        const result = execute(
            'INSERT INTO contexts (name, created, is_archived, last_touched) VALUES (?, ?, 0, ?)',
            name, ts, ts,
        );
        return res.status(201).json(one('SELECT * FROM contexts WHERE id = ?', result.lastInsertRowid));
    },

    // Returns the breadcrumb so the device can read "where I stopped" back
    // through the speaker the moment the pad is pressed.
    setContextActiveById: (req, res) => {
        const id = Number(req.params.id);
        const context = one('SELECT * FROM contexts WHERE id = ?', id);
        if (!context) return res.status(404).json({ error: 'Not found' });

        const ts = now();
        execute('UPDATE app_state SET active_context_id = ?, switched_at = ? WHERE id = 1', id, ts);
        execute('UPDATE contexts SET last_touched = ? WHERE id = ?', ts, id);
        return res.json({ context, breadcrumb: lastBreadcrumb(id) });
    },

    updateCrumbByContextId: (req, res) => {
        const id = Number(req.params.id);
        if (!one('SELECT id FROM contexts WHERE id = ?', id)) {
            return res.status(404).json({ error: 'Not found' });
        }
        // The body is optional on purpose: no touch pad on the device can
        // produce text, so an empty POST records a bare "something happened
        // here" marker to fill in from the tab later.
        const text = (req.body?.text || '').trim() || '(marked from the device)';
        const ts = now();
        const result = execute(
            'INSERT INTO breadcrumbs (context_id, text, timestamp) VALUES (?, ?, ?)',
            id, text, ts,
        );
        execute('UPDATE contexts SET last_touched = ? WHERE id = ?', ts, id);
        return res.status(201).json(one('SELECT * FROM breadcrumbs WHERE id = ?', result.lastInsertRowid));
    },

    // One endpoint doing three jobs: the device's idle OLED, the 6pm servo nag,
    // and the tab's header. One thing to keep correct instead of three.
    getToday: (req, res) => {
        const active = activeId();
        const state = one('SELECT switched_at FROM app_state WHERE id = 1');
        const today = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

        const { n: noteCount } = one(
            "SELECT COUNT(*) AS n FROM notes WHERE substr(timestamp, 1, 10) = ?", date,
        );
        const elapsed = state?.switched_at
            ? Math.max(0, Math.floor((Date.now() - new Date(state.switched_at).getTime()) / 1000))
            : null;

        return res.json({
            date,
            active_context: active ? one('SELECT id, name FROM contexts WHERE id = ?', active) : null,
            elapsed_s: elapsed,
            note_count: noteCount,
            logged_today: noteCount > 0,
            pending: one("SELECT COUNT(*) AS n FROM notes WHERE status = 'pending'").n,
        });
    },
};
