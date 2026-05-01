/**
 * Ferran Torres Shot Alert — Cyberdeck Edition
 * Powered by AllSportsAPI (RapidAPI)
 *
 * Changes from original:
 *   - Replaced play-sound with termux-media-player (Termux:API)
 *   - Smart polling — slow when no match, fast during live match
 *   - Rate limit protection — tracks API calls, backs off if needed
 *   - Auto-retry on network errors without crashing
 *   - Logs to file so you can check history via tmux attach
 *   - TTS fallback if audio file fails
 *
 * Setup:
 *   1. Place videoplayback.m4a in same directory as this script
 *   2. pkg install termux-api nodejs
 *   3. node ferran_alert.mjs
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execAsync = promisify(exec);

// ── CONFIG ────────────────────────────────────────────────────────────────────
const AUDIO_FILE = `${process.env.HOME}/videoplayback.m4a`;
const LOG_FILE = `${process.env.HOME}/ferran_alert.log`;
const PLAYER_NAME = "Ferran Torres";

// Polling intervals
const POLL_NO_MATCH = 5 * 60_000; // 5 min — when no live match
const POLL_LIVE = 60_000; // 1 min — during live match
const POLL_HALFTIME = 3 * 60_000; // 3 min — during halftime

// Rate limit protection
const MAX_CALLS_PER_HOUR = 50; // stay well under API limit

// Optional: force a specific match ID (null = auto-detect live Barca match)
const EVENT_ID = null;
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://allsportsapi2.p.rapidapi.com/api";
const HEADERS = {
  "Content-Type": "application/json",
  "x-rapidapi-host": "allsportsapi2.p.rapidapi.com",
  "x-rapidapi-key": "1bb0da01f9mshc7f29bcb50308d1p1b9885jsn564cac0d91d0",
};

// ── STATE ─────────────────────────────────────────────────────────────────────
const shotCounts = {};
let apiCallCount = 0;
let apiWindowStart = Date.now();
let currentEventId = null;
let errorStreak = 0;

// ── LOGGING ───────────────────────────────────────────────────────────────────
function log(msg, alsoFile = true) {
  const ts = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  if (alsoFile) {
    try {
      fs.appendFileSync(LOG_FILE, line + "\n");
    } catch {}
  }
}

// ── RATE LIMIT GUARD ──────────────────────────────────────────────────────────
function canCallApi() {
  const now = Date.now();
  // reset counter every hour
  if (now - apiWindowStart > 3_600_000) {
    apiCallCount = 0;
    apiWindowStart = now;
  }
  if (apiCallCount >= MAX_CALLS_PER_HOUR) {
    log(`⚠️  Rate limit guard — ${apiCallCount} calls this hour, backing off`);
    return false;
  }
  apiCallCount++;
  return true;
}

// ── API ───────────────────────────────────────────────────────────────────────
async function apiFetch(path) {
  if (!canCallApi()) throw new Error("Rate limit guard triggered");
  const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS });
  if (res.status === 429) throw new Error("API rate limited (429)");
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

async function getLiveBarcaEvent() {
  const data = await apiFetch("/matches/live");
  const events = data.events ?? [];
  return (
    events.find(
      (e) =>
        e.homeTeam?.name?.toLowerCase().includes("barcelona") ||
        e.awayTeam?.name?.toLowerCase().includes("barcelona"),
    ) ?? null
  );
}

async function getShotmap(eventId) {
  return apiFetch(`/match/${eventId}/shotmap`);
}

// ── SHOT DETECTION ────────────────────────────────────────────────────────────
function findFerranShots(shotmapData) {
  const shots = shotmapData.shotmap ?? [];
  const ferranShots = shots.filter((s) =>
    s.player?.name?.toLowerCase().includes(PLAYER_NAME.toLowerCase()),
  );
  const onTarget = ferranShots.filter(
    (s) => s.shotType === "save" || s.shotType === "goal",
  ).length;
  return {
    total: ferranShots.length,
    onTarget,
    name: ferranShots[0]?.player?.name ?? PLAYER_NAME,
    shotIds: new Set(ferranShots.map((s) => s.id)),
  };
}

// ── AUDIO ─────────────────────────────────────────────────────────────────────
async function playAlert(shotInfo) {
  log(
    `💥 SHOT! ${shotInfo.name} — total: ${shotInfo.total} (${shotInfo.onTarget} on target)`,
  );

  // try audio file first
  if (fs.existsSync(AUDIO_FILE)) {
    try {
      await execAsync(`termux-media-player play "${AUDIO_FILE}"`);
      log(`🔊 Audio played: ${AUDIO_FILE}`);
      return;
    } catch (e) {
      log(`⚠️  Audio failed: ${e.message} — falling back to TTS`);
    }
  } else {
    log(`⚠️  Audio file not found: ${AUDIO_FILE} — using TTS`);
  }

  // TTS fallback
  try {
    await execAsync(
      `termux-tts-speak "Ferran Torres shot! Total shots: ${shotInfo.total}"`,
    );
  } catch (e) {
    log(`⚠️  TTS also failed: ${e.message}`);
  }
}

// ── MATCH CHECK ───────────────────────────────────────────────────────────────
async function checkForFerranShot(eventId) {
  let shotmapData;
  try {
    shotmapData = await getShotmap(eventId);
  } catch (e) {
    log(`  [Shotmap error: ${e.message}]`);
    return;
  }

  const info = findFerranShots(shotmapData);
  const prev = shotCounts[eventId];

  if (prev === undefined) {
    shotCounts[eventId] = { count: info.total, ids: info.shotIds };
    log(`  Baseline: ${info.name} has ${info.total} shot(s) so far`);
    return;
  }

  const newIds = [...info.shotIds].filter((id) => !prev.ids.has(id));
  shotCounts[eventId] = { count: info.total, ids: info.shotIds };

  if (newIds.length > 0) {
    for (let i = 0; i < newIds.length; i++) {
      await playAlert(info);
      if (i < newIds.length - 1) await sleep(1000);
    }
  } else {
    log(`  ${info.name}: ${info.total} shot(s) — no change`);
  }
}

// ── POLL INTERVAL LOGIC ───────────────────────────────────────────────────────
function getPollInterval(event) {
  if (!event) return POLL_NO_MATCH;
  const status = event.status?.type ?? "";
  if (status === "inprogress") return POLL_LIVE;
  if (status === "halftime") return POLL_HALFTIME;
  return POLL_NO_MATCH;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatMatch(event) {
  const home = event.homeTeam?.name ?? "?";
  const away = event.awayTeam?.name ?? "?";
  const scoreH = event.homeScore?.current ?? "?";
  const scoreA = event.awayScore?.current ?? "?";
  const minute = event.time?.current ?? "?";
  return `${home} ${scoreH}–${scoreA} ${away} (${minute}')`;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  log(`👀 Watching for ${PLAYER_NAME} shots in live Barcelona matches`);
  log(`   Audio file: ${AUDIO_FILE}`);
  log(`   Log file:   ${LOG_FILE}`);
  log(`   API limit:  max ${MAX_CALLS_PER_HOUR} calls/hour\n`);

  while (true) {
    try {
      let eventId, event;

      if (EVENT_ID !== null) {
        eventId = EVENT_ID;
        event = null;
        log(`[MATCH] Using forced event ID: ${eventId}`);
      } else {
        event = await getLiveBarcaEvent();
        if (!event) {
          log("No live Barcelona match right now. Sleeping 5 mins...");
          await sleep(POLL_NO_MATCH);
          continue;
        }
        eventId = event.id;
        log(`[LIVE] ${formatMatch(event)}`);
      }

      // reset shot baseline if match changed
      if (currentEventId !== eventId) {
        log(`[NEW MATCH] Switched to event ${eventId}`);
        currentEventId = eventId;
        delete shotCounts[eventId];
      }

      await checkForFerranShot(eventId);
      errorStreak = 0;

      const interval = getPollInterval(event);
      log(
        `  Next check in ${interval / 1000}s (API calls this hour: ${apiCallCount}/${MAX_CALLS_PER_HOUR})\n`,
      );
      await sleep(interval);
    } catch (e) {
      errorStreak++;
      const backoff = Math.min(errorStreak * 30_000, 5 * 60_000); // max 5 min backoff
      log(
        `[Error] ${e.message} — retry in ${backoff / 1000}s (streak: ${errorStreak})`,
      );
      await sleep(backoff);
    }
  }
}

main();
