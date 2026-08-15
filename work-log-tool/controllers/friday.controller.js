const { getDraft, approve, SECTIONS } = require('../lib/friday');

module.exports = {
    draft: async (req, res) => {
        const draft = await getDraft({
            week: req.query.week || null,
            refresh: req.query.refresh === '1',
        });
        return res.json({
            ...draft,
            // Labels travel with the draft so the tab does not hard-code them.
            section_meta: SECTIONS.map(([key, label, question]) => ({ key, label, question })),
        });
    },

    // Does not post to Slack — there is no Slack integration on this deck and no
    // SLACK_* secret. It records the approved text and hands back the rendered
    // message for the tab's COPY button, matching how standup.py's draft is
    // actually delivered.
    approve: (req, res) => {
        const result = approve(req.body?.week || null, req.body?.sections || null);
        return res.json(result);
    },
};
