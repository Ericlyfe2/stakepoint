/**
 * Live Control — mission control for in-play games.
 *  - Every live fixture as a control card: score steppers, match minute,
 *    per-selection odds nudging, per-selection / market / match suspension.
 *  - Push upcoming fixtures live, finish live games (record result + settle).
 *  - Polls every 5s so the board tracks what players see in near-real-time.
 */
import { useEffect, useRef, useState } from 'react';
import {
  adminFixtures, adminPatchFixture, adminPatchOdds,
  adminSuspend, adminClearSuspend, adminRecordResult, adminResetOdds,
} from '../../api/adminApi.js';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import { Card, Badge, Empty, Modal, numFmt } from '../../components/admin/primitives.jsx';
import {
  IconLive, IconRefresh, IconBan, IconCheck, IconSettle, IconAlert,
} from '../../components/admin/Icons.jsx';

const POLL_MS = 5000;

export default function LiveControlPage() {
  const { hasRole, showToast } = useAdmin();
  const canEdit = hasRole('odds_manager');
  const [fixtures, setFixtures] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [finishFx, setFinishFx] = useState(null);
  const pollRef = useRef(null);

  async function load(silent = true) {
    try {
      const r = await adminFixtures({});
      setFixtures(r.fixtures || []);
    } catch (e) {
      if (!silent) showToast(e.message, 'error');
    }
  }

  useEffect(() => {
    load(false);
    pollRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load(true);
    }, POLL_MS);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (id, fn, okMsg) => {
    setBusyId(id);
    try {
      await fn();
      if (okMsg) showToast(okMsg);
      await load(true);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  const live = (fixtures || []).filter((f) => f.isLive && !f.finished);
  const upcoming = (fixtures || []).filter((f) => !f.isLive && !f.finished);

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Live Control</h1>
          <p>Real-time control of every in-play game — scores, minutes, odds and suspensions. Changes hit player tickets within seconds.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge tone="danger" dot>{numFmt(live.length)} live</Badge>
          <button className="adm-btn" onClick={() => load(false)}><IconRefresh size={14} /> Refresh</button>
        </div>
      </header>

      {fixtures === null && <div className="adm-skel" style={{ height: 180, borderRadius: 14 }} />}

      {fixtures !== null && live.length === 0 && (
        <Card>
          <Empty title="No live games right now" subtitle="Push an upcoming fixture live below to start controlling it." />
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {live.map((fx) => (
          <LiveFixtureCard
            key={fx.id}
            fx={fx}
            canEdit={canEdit}
            busy={busyId === fx.id}
            onPatch={(body, msg) => act(fx.id, () => adminPatchFixture(fx.id, body), msg)}
            onOdds={(market, key, odds) => act(fx.id, () => adminPatchOdds(fx.id, { market, key, odds }), 'Odds updated.')}
            onResetOdds={() => act(fx.id, () => adminResetOdds(fx.id), 'Odds reset to feed values.')}
            onSuspend={(body, msg) => act(fx.id, () => adminSuspend(fx.id, body), msg)}
            onUnsuspend={() => act(fx.id, () => adminClearSuspend(fx.id), 'All suspensions cleared.')}
            onFinish={() => setFinishFx(fx)}
          />
        ))}
      </div>

      {upcoming.length > 0 && (
        <Card title="Upcoming fixtures" subtitle="Push a game live to start in-play control." flush>
          <div className="adm-table-scroll" style={{ maxHeight: 360 }}>
            <table className="adm-table">
              <thead><tr><th>Fixture</th><th>League</th><th>Kick-off</th><th></th></tr></thead>
              <tbody>
                {upcoming.slice(0, 30).map((fx) => (
                  <tr key={fx.id}>
                    <td style={{ fontWeight: 600 }}>{fx.home} — {fx.away}</td>
                    <td>{fx.leagueName || fx.leagueId}</td>
                    <td>{fx.day} {fx.kickoff || ''}</td>
                    <td className="num">
                      {canEdit && (
                        <button className="adm-btn sm primary" disabled={busyId === fx.id}
                                onClick={() => act(fx.id, () => adminPatchFixture(fx.id, { isLive: true, minute: "1'", scoreHome: 0, scoreAway: 0 }), `${fx.home} — ${fx.away} is now LIVE.`)}>
                          <IconLive size={12} /> Go live
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {finishFx && (
        <FinishModal
          fx={finishFx}
          onClose={() => setFinishFx(null)}
          onSubmit={async (h, a) => {
            try {
              const r = await adminRecordResult(finishFx.id, { scoreHome: h, scoreAway: a, autoSettle: true });
              showToast(`Full time — result recorded. Settled ${r.settled?.settledWins || 0}w / ${r.settled?.settledLoss || 0}l.`);
              setFinishFx(null);
              await load(true);
            } catch (e) { showToast(e.message, 'error'); }
          }}
        />
      )}
    </>
  );
}

/* ── one live match, full control surface ── */
function LiveFixtureCard({ fx, canEdit, busy, onPatch, onOdds, onResetOdds, onSuspend, onUnsuspend, onFinish }) {
  const minuteNum = Number(String(fx.minute || '').replace(/[^0-9]/g, '')) || 0;

  const bumpScore = (side, delta) => {
    const key = side === 'home' ? 'scoreHome' : 'scoreAway';
    const cur = Number(fx[key] ?? 0);
    const next = Math.max(0, cur + delta);
    onPatch({ [key]: next }, `Score updated: ${side === 'home' ? next : fx.scoreHome ?? 0}-${side === 'away' ? next : fx.scoreAway ?? 0}`);
  };

  const setMinute = (m) => onPatch({ minute: `${Math.max(0, Math.min(130, m))}'` }, `Minute set to ${m}'.`);

  return (
    <Card flush>
      <div className="adm-live-card">
        {/* head */}
        <div className="adm-live-head">
          <div className="adm-live-title">
            <Badge tone="danger" dot>LIVE {fx.minute || ''}</Badge>
            <strong>{fx.home} — {fx.away}</strong>
            <span className="adm-live-league">{fx.leagueName || fx.leagueId} · {fx.sport}</span>
            {fx.suspended && <Badge tone="warn">Match suspended</Badge>}
          </div>
          {canEdit && (
            <div className="adm-live-actions">
              {fx.suspended
                ? <button className="adm-btn sm" disabled={busy} onClick={onUnsuspend}><IconCheck size={12} /> Unsuspend</button>
                : <button className="adm-btn sm warn" disabled={busy} onClick={() => onSuspend({ all: true }, 'Whole match suspended — all bets blocked.')}><IconBan size={12} /> Suspend match</button>}
              <button className="adm-btn sm" disabled={busy} onClick={onResetOdds}><IconRefresh size={12} /> Reset odds</button>
              <button className="adm-btn sm" disabled={busy} onClick={() => onPatch({ isLive: false }, 'Match taken off live.')}>Off live</button>
              <button className="adm-btn sm primary" disabled={busy} onClick={onFinish}><IconSettle size={12} /> Full time & settle</button>
            </div>
          )}
        </div>

        {/* score + clock */}
        <div className="adm-live-score-row">
          <ScoreBox label={fx.home} value={fx.scoreHome ?? 0} disabled={!canEdit || busy} onBump={(d) => bumpScore('home', d)} />
          <div className="adm-live-clock">
            <div className="adm-live-clock-val">{fx.scoreHome ?? 0} : {fx.scoreAway ?? 0}</div>
            {canEdit && (
              <div className="adm-live-clock-ctl">
                <button className="adm-btn sm" disabled={busy} onClick={() => setMinute(minuteNum - 1)}>−1'</button>
                <span className="adm-live-min">{fx.minute || "0'"}</span>
                <button className="adm-btn sm" disabled={busy} onClick={() => setMinute(minuteNum + 1)}>+1'</button>
                <button className="adm-btn sm" disabled={busy} onClick={() => setMinute(45)}>HT</button>
                <button className="adm-btn sm" disabled={busy} onClick={() => setMinute(46)}>H2</button>
                <button className="adm-btn sm" disabled={busy} onClick={() => setMinute(90)}>90'</button>
              </div>
            )}
          </div>
          <ScoreBox label={fx.away} value={fx.scoreAway ?? 0} disabled={!canEdit || busy} onBump={(d) => bumpScore('away', d)} />
        </div>

        {/* markets */}
        <div className="adm-live-markets">
          {Object.entries(fx.markets || {}).map(([mk, market]) => (
            <div key={mk} className="adm-live-market">
              <div className="adm-live-market-head">
                <span className="adm-live-market-name">
                  {market.name || mk}
                  {market.suspended && <Badge tone="warn">Suspended</Badge>}
                </span>
                {canEdit && !market.suspended && (
                  <button className="adm-btn sm ghost" disabled={busy}
                          onClick={() => onSuspend({ market: mk }, `Market "${mk}" suspended.`)}>
                    <IconBan size={11} /> Suspend market
                  </button>
                )}
              </div>
              <div className="adm-live-sels">
                {(market.selections || []).map((sel) => (
                  <OddsCell key={sel.key} sel={sel} disabled={!canEdit || busy || !!market.suspended}
                            onSet={(odds) => onOdds(mk, sel.key, odds)}
                            onLock={() => onSuspend({ selection: `${mk}:${sel.key}` }, `Selection ${mk}:${sel.key} locked.`)} />
                ))}
              </div>
            </div>
          ))}
          {Object.keys(fx.markets || {}).length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: 12.5, padding: '6px 0' }}>
              <IconAlert size={12} /> No markets on this fixture.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function ScoreBox({ label, value, disabled, onBump }) {
  return (
    <div className="adm-live-scorebox">
      <div className="adm-live-scorebox-team" title={label}>{label}</div>
      <div className="adm-live-scorebox-ctl">
        <button className="adm-btn sm" disabled={disabled} onClick={() => onBump(-1)} aria-label={`${label} minus goal`}>−</button>
        <span className="adm-live-scorebox-val">{value}</span>
        <button className="adm-btn sm primary" disabled={disabled} onClick={() => onBump(1)} aria-label={`${label} plus goal`}>+ Goal</button>
      </div>
    </div>
  );
}

/* Inline odds editor: value, quick ±0.10, direct entry on blur, lock. */
function OddsCell({ sel, disabled, onSet, onLock }) {
  const [val, setVal] = useState(String(sel.odds ?? ''));
  useEffect(() => { setVal(String(sel.odds ?? '')); }, [sel.odds]);

  const commit = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1.01 || n > 999) { setVal(String(sel.odds ?? '')); return; }
    if (n !== Number(sel.odds)) onSet(Number(n.toFixed(2)));
  };
  const nudge = (d) => {
    const n = Math.max(1.01, Number((Number(sel.odds || 1.01) + d).toFixed(2)));
    onSet(n);
  };

  return (
    <div className={`adm-live-sel${sel.suspended ? ' locked' : ''}`}>
      <span className="adm-live-sel-key" title={sel.label || sel.key}>{sel.label || sel.key}</span>
      {sel.suspended ? (
        <Badge tone="warn">Locked</Badge>
      ) : (
        <span className="adm-live-sel-ctl">
          <button className="adm-btn sm" disabled={disabled} onClick={() => nudge(-0.10)} aria-label="odds down">▾</button>
          <input
            className="adm-input adm-live-odds-input"
            type="number" step="0.01" min="1.01" max="999"
            value={val} disabled={disabled}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => commit(val)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <button className="adm-btn sm" disabled={disabled} onClick={() => nudge(+0.10)} aria-label="odds up">▴</button>
          <button className="adm-btn sm ghost" disabled={disabled} onClick={onLock} title="Lock this selection"><IconBan size={11} /></button>
        </span>
      )}
    </div>
  );
}

function FinishModal({ fx, onClose, onSubmit }) {
  const [h, setH] = useState(String(fx.scoreHome ?? 0));
  const [a, setA] = useState(String(fx.scoreAway ?? 0));
  return (
    <Modal open title={`Full time — ${fx.home} vs ${fx.away}`} onClose={onClose}
           description="Locks the fixture at this score and settles every open bet touching it."
           footer={
             <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
               <button className="adm-btn" onClick={onClose}>Cancel</button>
               <button className="adm-btn primary" onClick={() => onSubmit(Number(h) || 0, Number(a) || 0)}>
                 <IconSettle size={13} /> Record {h || 0}-{a || 0} & settle
               </button>
             </div>
           }>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-around', marginTop: 8 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{fx.home}</div>
          <input className="adm-input" style={{ width: 80, textAlign: 'center', height: 44, fontSize: 22, fontWeight: 700 }}
                 type="number" min="0" max="199" value={h} onChange={(e) => setH(e.target.value)} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--text-dim)' }}>—</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{fx.away}</div>
          <input className="adm-input" style={{ width: 80, textAlign: 'center', height: 44, fontSize: 22, fontWeight: 700 }}
                 type="number" min="0" max="199" value={a} onChange={(e) => setA(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
