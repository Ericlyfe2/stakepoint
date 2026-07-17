/**
 * Client-side ticking simulation for a fixture's match clock.
 *
 * The server/admin only send a minute string ("63'", "45+2'") when it
 * actually changes (a poll tick or an admin stepper click). Between those
 * updates the on-screen clock should still visibly move — down to the
 * second — so we simulate the tick locally from the moment that minute
 * string was observed.
 *
 * At 45' a football clock shows stoppage time ("45+1'", "45+2'", …) instead
 * of "46'", "47'" — we pick a stable 1-4 minute stoppage per fixture (hashed
 * from the fixture id, so admin and user screens agree without a server
 * round trip) and freeze the simulated clock at the end of it until the
 * admin advances the match into the second half.
 */

export function parseMinuteStr(raw) {
  const s = String(raw || '').replace(/'/g, '').trim();
  if (!s) return null;
  const [basePart, extraPart] = s.split('+');
  const base = parseInt(basePart, 10);
  if (Number.isNaN(base)) return null;
  const extra = extraPart ? (parseInt(extraPart, 10) || 0) : 0;
  return { base, extra };
}

export function stoppageMinutesFor(fixtureId, half = 1) {
  const s = `${fixtureId || ''}::h${half}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 1 + (h % 4); // 1..4, stable per fixture
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * @param rawMinute  the last minute string received from the server/admin
 * @param anchorTs   Date.now() at the moment rawMinute was observed
 * @param fixtureId  used to derive a stable stoppage-time allowance
 * @param now        Date.now() (injectable for tests)
 */
export function tickMinuteDisplay(rawMinute, anchorTs, fixtureId, now = Date.now()) {
  const parsed = parseMinuteStr(rawMinute);
  if (!parsed) return rawMinute || '';

  const elapsedSec = Math.max(0, Math.floor((now - anchorTs) / 1000));
  const reportedSec = (parsed.base + parsed.extra) * 60;
  let totalSec = reportedSec + elapsedSec;

  // First-half stoppage: freeze the clock once it fills the allotted
  // added time instead of ticking straight into "46:00".
  if (parsed.base < 46) {
    const cap = stoppageMinutesFor(fixtureId, 1);
    const maxSec = (45 + cap) * 60 + 59;
    if (totalSec > 45 * 60) totalSec = Math.min(totalSec, maxSec);
  }

  // Full-match sanity cap: a fixture still ticking well past 90' almost
  // always means nobody ever finished it on the admin side (a forgotten
  // test/live match), not that it's genuinely 150 minutes into a football
  // game. Freeze the simulated clock at 90' + a stable per-fixture
  // stoppage allowance instead of climbing into triple digits forever —
  // but never clamp below whatever minute was actually reported (e.g. an
  // admin who deliberately set extra time in a cup match).
  const cap2 = stoppageMinutesFor(fixtureId, 2);
  const maxFullTimeSec = (90 + cap2) * 60 + 59;
  if (totalSec > maxFullTimeSec) totalSec = Math.max(maxFullTimeSec, reportedSec);

  const minute = Math.floor(totalSec / 60);
  const second = totalSec % 60;

  // Only show the "45+" stoppage form when we simulated crossing into it
  // from the first half — a fixture whose real minute is already past 45
  // (e.g. "73'") is in the second half and should just show "73:00'".
  const inFirstHalfStoppage = parsed.base < 46 && minute > 45;
  if (inFirstHalfStoppage) return `45+${minute - 45}:${pad2(second)}'`;
  return `${minute}:${pad2(second)}'`;
}
