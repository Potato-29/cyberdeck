// Friday assembly: a week of terse, context-tagged notes -> the five sections.
//
// The sections and the Slack rendering are taken verbatim from standup.py so
// the output is shaped like the updates already being posted. Two things are
// deliberately different, and they are what make the draft usable here:
//
//  1. The model's input is grouped by CONTEXT, then chronologically — not by
//     day. standup.py groups by weekday because it has nothing else to group
//     by; this has contexts, and a weekly update to a team is organised by
//     project. Nobody wants to read "on Tuesday I...".
//
//  2. Breadcrumbs are fed in separately, labelled as open threads. They are
//     literally "where I stopped", which is what The Horizon is asking for.
//     This is the payoff for keeping them in their own table.
//
// Reads notes; writes nothing back. The draft is regenerated fresh so notes can
// be edited and the draft re-run.

const fs = require('node:fs');
const path = require('node:path');
const { query, DB_PATH } = require('../db');
const { chatJson, hasKey, LLM_MODEL } = require('./groq');

// The five sections of the Friday thread reply, in order. Keep in step with
// SECTIONS in standup.py:64-77.
const SECTIONS = [
    ['progress', 'The Progress',
        'What did you work on this week - any key wins or learnings?'],
    ['ai_edge', 'The AI Edge',
        'How did you use AI (automated, optimized, researched) this week? Anything that you learnt?'],
    ['automation_gap', 'The Automation Gap',
        'What part of your workflow still feels "manual" and should be automated? (Where do you need help/tools?)'],
    ['values', 'Values in Action',
        'Which company value did you see in action this week (in yourself or a peer)?'],
    ['horizon', 'The Horizon', 'What are the big rocks for next week?'],
];

const CACHE_FILE = path.join(path.dirname(DB_PATH), 'work-log-weekly-cache.json');

// ── Week maths ───────────────────────────────────────────
// Monday 00:00 local of the week containing `when`.
function weekStart(when = new Date()) {
    const d = new Date(when);
    d.setHours(0, 0, 0, 0);
    const dow = (d.getDay() + 6) % 7;   // Monday = 0
    d.setDate(d.getDate() - dow);
    return d;
}

function isoWeek(when = new Date()) {
    const d = weekStart(when);
    // ISO weeks belong to the year containing that week's Thursday.
    const thursday = new Date(d);
    thursday.setDate(d.getDate() + 3);
    const firstThursday = new Date(thursday.getFullYear(), 0, 4);
    const firstWeekMon = weekStart(firstThursday);
    const week = Math.round((thursday - firstWeekMon) / (7 * 24 * 3600 * 1000)) + 1;
    return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekBounds(weekLabel) {
    if (!weekLabel) {
        const start = weekStart();
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        return [start, end];
    }
    const [year, wk] = weekLabel.split('-W').map(Number);
    const firstThursday = new Date(year, 0, 4);
    const start = weekStart(firstThursday);
    start.setDate(start.getDate() + (wk - 1) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return [start, end];
}

const localIso = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// ── Input assembly ───────────────────────────────────────
function weekData(weekLabel) {
    const [start, end] = weekBounds(weekLabel);
    const lo = localIso(start);
    const hi = localIso(end);
    // Half-open [start, end). Compared on the leading 19 chars so the trailing
    // timezone offset in the stored value does not affect the range test.
    const notes = query(
        `SELECT n.id, n.timestamp, n.raw_text, n.source, n.status,
                COALESCE(c.name, 'unfiled') AS context
           FROM notes n LEFT JOIN contexts c ON c.id = n.context_id
          WHERE substr(n.timestamp, 1, 19) >= ? AND substr(n.timestamp, 1, 19) < ?
            AND n.status != 'pending' AND trim(n.raw_text) != ''
          ORDER BY context, n.timestamp`,
        lo, hi,
    );
    const crumbs = query(
        `SELECT b.text, b.timestamp, COALESCE(c.name, 'unfiled') AS context
           FROM breadcrumbs b LEFT JOIN contexts c ON c.id = b.context_id
          WHERE substr(b.timestamp, 1, 19) >= ? AND substr(b.timestamp, 1, 19) < ?
            AND trim(b.text) != ''
          ORDER BY b.timestamp`,
        lo, hi,
    );
    return { notes, crumbs, start, end };
}

// Grouped by context, then chronological. The model's only input.
function formatNotes(notes, crumbs) {
    if (!notes.length && !crumbs.length) return '(no notes logged)';

    const byContext = new Map();
    for (const n of notes) {
        if (!byContext.has(n.context)) byContext.set(n.context, []);
        byContext.get(n.context).push(n);
    }
    const crumbsBy = new Map();
    for (const c of crumbs) {
        if (!crumbsBy.has(c.context)) crumbsBy.set(c.context, []);
        crumbsBy.get(c.context).push(c);
    }

    const lines = [];
    for (const context of new Set([...byContext.keys(), ...crumbsBy.keys()])) {
        lines.push(`\n## ${context}`);
        for (const n of byContext.get(context) || []) {
            const day = n.timestamp.slice(0, 16).replace('T', ' ');
            const voice = n.source === 'voice' ? '[voice] ' : '';
            lines.push(`- ${day}  ${voice}${n.raw_text.replace(/\n+/g, ' / ')}`);
        }
        for (const c of crumbsBy.get(context) || []) {
            lines.push(`  open thread: ${c.text.replace(/\n+/g, ' / ')}`);
        }
    }
    return lines.join('\n').trim();
}

function buildPrompt(notes, crumbs) {
    const questions = SECTIONS
        .map(([, label, q], i) => `${i + 1}. ${label}: ${q}`)
        .join('\n');

    const values = process.env.STANDUP_VALUES || '';
    const valuesNote = values
        ? `The company values are: ${values}. Name one of them exactly.`
        : 'The company values were not provided, so describe the value you saw in ' +
          'action in plain words rather than naming an official one.';

    return `Here are my raw work notes from this week, grouped by the project context I logged them against:

${formatNotes(notes, crumbs)}

Turn them into my weekly update for the team Slack thread. The five questions are:

${questions}

Rules:
- Write in first person, the way I'd type it into Slack. Plain language, no
  corporate filler, no emoji, no bold.
- Format every answer as bullet points, not paragraphs: one line per point, each
  starting with "- ". One item logged means one bullet; several related items can
  be combined into one if they're genuinely the same thing.
- Ground every bullet in the notes above. Do not invent work I didn't log, and do
  not inflate impact that isn't written down. A thin week should read as a thin week.
- Keep identifiers, file names, error strings and library names EXACT. Never
  paraphrase a symbol name — that precision is what makes the update credible.
- Notes marked [voice] are speech transcriptions. They may be disfluent, run on,
  or contain transcription errors. Infer what I meant; don't quote them verbatim.
- Lines marked "open thread" are where I stopped mid-task, not things I finished.
  They belong in The Horizon far more often than in The Progress.
- The "## name" headers are project contexts, not days. Group the update by theme,
  and don't narrate the week day by day.
- ${valuesNote}
- If a section has nothing to draw on, say so in a single honest bullet rather
  than padding it out.

Reply with a JSON object and nothing else. It must have exactly these five string
keys, each holding that question's answer as newline-separated "- " bullet points:
${SECTIONS.map(([key]) => key).join(', ')}`;
}

// ── Rendering ────────────────────────────────────────────
// One '- ' bullet per line, whatever the model produced. Ported from
// standup.py:335-352 so a template fallback renders identically to a real draft.
function bulletize(text) {
    if (!text || !String(text).trim()) return '- —';
    return String(text)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `- ${line.replace(/^[-*•]\s*/, '')}`)
        .join('\n');
}

function render(sections) {
    return SECTIONS
        .map(([key, label], i) => `${i + 1}. ${label}:\n${bulletize(sections[key])}`)
        .join('\n\n');
}

// No API key, or Groq refused — bucket the raw notes so there is still a draft.
function generateFallback(notes, crumbs) {
    const sections = Object.fromEntries(SECTIONS.map(([k]) => [k, '']));
    sections.progress = notes.map((n) => n.raw_text).join('\n');
    sections.horizon = crumbs.map((c) => `${c.context}: ${c.text}`).join('\n');
    return sections;
}

// ── Cache ────────────────────────────────────────────────
function loadCache() {
    try {
        const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        // Self-heal: drop entries written by an older shape.
        for (const [k, v] of Object.entries(raw)) {
            if (!v || typeof v.note_count !== 'number') delete raw[k];
        }
        return raw;
    } catch {
        return {};
    }
}

function saveCache(cache) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch (err) {
        console.log(`[worklog] could not write draft cache: ${err.message}`);
    }
}

async function getDraft({ week = null, refresh = false } = {}) {
    const label = week || isoWeek();
    const cache = loadCache();
    const { notes, crumbs } = weekData(week);

    // A cached draft is stale the moment the note count changes, so it is part
    // of the key rather than something to remember to invalidate.
    const cached = cache[label];
    if (!refresh && cached && cached.note_count === notes.length) {
        return { ...cached, week: label, cached: true };
    }

    let sections = null;
    if (hasKey() && (notes.length || crumbs.length)) {
        sections = await chatJson(buildPrompt(notes, crumbs));
        // Sanity check: at least one expected key must be non-empty, otherwise
        // treat it as a failure rather than shipping five blank sections.
        if (sections && !SECTIONS.some(([k]) => String(sections[k] || '').trim())) {
            sections = null;
        }
    }

    const generatedBy = sections ? LLM_MODEL : 'template';
    if (!sections) sections = generateFallback(notes, crumbs);

    const draft = {
        week: label,
        sections,
        rendered: render(sections),
        note_count: notes.length,
        crumb_count: crumbs.length,
        generated_by: generatedBy,
        generated_at: new Date().toISOString(),
    };

    cache[label] = draft;
    saveCache(cache);
    return { ...draft, cached: false };
}

function approve(week, sections) {
    const label = week || isoWeek();
    const cache = loadCache();
    const draft = cache[label];
    const finalSections = sections || draft?.sections || {};
    const rendered = render(finalSections);
    if (draft) {
        cache[label] = {
            ...draft,
            sections: finalSections,
            rendered,
            approved_at: new Date().toISOString(),
        };
        saveCache(cache);
    }
    return { week: label, rendered };
}

module.exports = { SECTIONS, getDraft, approve, render, bulletize, isoWeek, weekData, buildPrompt };
