const BONUS = 0.08;

export function formatAmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseStake(raw) {
  const n = parseFloat(String(raw || '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function generateId() {
  return `sel-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
}

export function pickLabel(market, key, match) {
  const team = (k) => (k === '1' ? match.home : k === '2' ? match.away : 'Draw');

  if (market === '1X2' || market === '1H1X2') {
    const prefix = market === '1H1X2' ? '1H ' : '';
    if (key === '1') return `${prefix}${match.home} to win`;
    if (key === '2') return `${prefix}${match.away} to win`;
    return `${prefix}Draw`;
  }
  if (market === 'ML') return `${key === '1' ? match.home : match.away} to win`;
  if (market === 'OU25') return `${key} 2.5 Goals`;
  if (market === 'OU15') return `${key} 1.5 Goals`;
  if (market === 'OU35') return `${key} 3.5 Goals`;
  if (market === '1HOU05') return `1H ${key} 0.5 Goals`;
  if (market === 'BTTS') return `Both Teams To Score - ${key === 'Yes' ? 'Yes' : 'No'}`;
  if (market === '1HBTTS') return `1H Both Teams To Score - ${key}`;
  if (market === 'DC') {
    if (key === '1X') return `${match.home} or Draw`;
    if (key === 'X2') return `Draw or ${match.away}`;
    return `${match.home} or ${match.away}`;
  }
  if (market === 'DNB') return `Draw No Bet - ${team(key)}`;
  if (market === 'AH1') {
    if (key === 'H-1') return `${match.home} -1`;
    if (key === 'A+1') return `${match.away} +1`;
    return `Handicap ${key}`;
  }
  if (market === 'WINBTTS') {
    const result = key[0] === '1' ? match.home : key[0] === '2' ? match.away : 'Draw';
    return `${result} & BTTS ${key[1] === 'Y' ? 'Yes' : 'No'}`;
  }
  if (market === 'WINOU25') {
    const result = key[0] === '1' ? match.home : key[0] === '2' ? match.away : 'Draw';
    return `${result} & ${key[1] === 'O' ? 'Over' : 'Under'} 2.5`;
  }
  if (market === 'BTTSOU25') {
    return `BTTS ${key[0] === 'Y' ? 'Yes' : 'No'} & ${key[1] === 'O' ? 'Over' : 'Under'} 2.5`;
  }
  if (market === 'HTFT') {
    const half = (k) => (k === '1' ? match.home : k === '2' ? match.away : 'Draw');
    const [a, b] = key.split('/');
    return `HT/FT - ${half(a)} / ${half(b)}`;
  }
  if (market === 'CS') return `Correct Score ${key === 'OTHER' ? 'Any Other' : key.replace('-', ' - ')}`;
  if (market === 'TP') return `${key} ${match.line || ''} pts`;
  if (market === 'SETS') return `${key} 2.5 sets`;
  if (market === 'HCAP') return `Handicap ${key}`;
  if (market === 'EH') {
    if (key === '1') return `${match.home} Win`;
    if (key === '2') return `${match.away} Win`;
    return `Handicap ${key}`;
  }
  if (market === 'OE') return `Total Goals ${key}`;
  if (market === 'CS_HOME') return `${match.home} Correct Score`;
  if (market === 'CS_AWAY') return `${match.away} Correct Score`;
  if (market === 'WIN') return `${key === '1' ? match.home : match.away} Clean Sheet`;
  if (market === 'HTRES') {
    if (key === '1') return `HT: ${match.home}`;
    if (key === 'X') return 'HT: Draw';
    return `HT: ${match.away}`;
  }
  return `${market} - ${key}`;
}

export function matchMeta(match) {
  const h = match.home, a = match.away;
  if (match.isLive) return `${h} vs ${a} - LIVE ${match.minute || ''}`;
  return `${h} vs ${a} - ${[match.kickoff, match.day].filter(Boolean).join(' ')}`;
}

export function marketName(market) {
  const names = {
    '1X2': 'Match Result',
    'ML': 'Money Line',
    'OU25': 'Total Goals Over/Under 2.5',
    'OU15': 'Total Goals Over/Under 1.5',
    'OU35': 'Total Goals Over/Under 3.5',
    '1HOU05': '1st Half Goals Over/Under 0.5',
    'BTTS': 'Both Teams To Score',
    '1HBTTS': '1st Half Both Teams To Score',
    'DC': 'Double Chance',
    'DNB': 'Draw No Bet',
    'AH1': 'Asian Handicap +/-1',
    'WINBTTS': 'Result & Both Teams To Score',
    'WINOU25': 'Result & Total Goals 2.5',
    'BTTSOU25': 'BTTS & Total Goals 2.5',
    'HTFT': 'Half Time / Full Time',
    'CS': 'Correct Score',
    '1H1X2': '1st Half Result',
    'TP': 'Total Points',
    'HCAP': 'Handicap',
    'SETS': 'Total Sets',
    'EH': 'European Handicap',
    'OE': 'Odd/Even Goals',
    'WIN': 'Clean Sheet',
    'HTRES': 'Half Time Result',
    'FTS': 'First Team To Score',
    'LTS': 'Last Team To Score',
  };
  return names[market] || market;
}

export function buildSelection(match, market, outcome, odds) {
  return {
    id: generateId(),
    matchId: match.id,
    market,
    outcome,
    odds: Number(odds),
    pickLabel: pickLabel(market, outcome, match),
    marketLabel: marketName(market),
    meta: matchMeta(match),
    home: match.home,
    away: match.away,
    competition: match.competition || '',
    isLive: !!match.isLive,
    trend: null,
    stale: false,
    locked: false,
  };
}

export function isDuplicate(selections, matchId, market, outcome) {
  return selections.some(
    (s) => s.matchId === matchId && s.market === market && s.outcome === outcome
  );
}

export function findSelection(selections, matchId, market, outcome) {
  return selections.find(
    (s) => s.matchId === matchId && s.market === market && s.outcome === outcome
  );
}

export function computeSinglePayout(odds, stake) {
  return stake * odds;
}

export function computeMultipleOdds(selections) {
  if (!selections.length) return 0;
  return selections.reduce((p, s) => p * s.odds, 1);
}

export function computeMultiplePayout(selections, stake) {
  const odds = computeMultipleOdds(selections);
  return stake * odds * (1 + BONUS);
}

export function computeTotalOdds(selections) {
  if (!selections.length) return 0;
  return selections.reduce((p, s) => p * s.odds, 1);
}

export function findConflictingSelection(selections, matchId, market) {
  return selections.find(
    (s) => s.matchId === matchId && s.market === market
  );
}

export function hasConflictingPicks(selections) {
  const groups = new Map();
  for (const s of selections) {
    const key = `${s.matchId}:${s.market}`;
    if (groups.has(key) && groups.get(key) !== s.outcome) return true;
    groups.set(key, s.outcome);
  }
  return false;
}

export function checkConflicts(selections) {
  const groups = new Map();
  for (const s of selections) {
    const key = `${s.matchId}:${s.market}`;
    if (!groups.has(key)) {
      groups.set(key, [s]);
    } else {
      groups.get(key).push(s);
    }
  }
  const conflicts = [];
  for (const [key, group] of groups) {
    if (group.length > 1) {
      const unique = new Set(group.map((s) => s.outcome));
      if (unique.size > 1) {
        conflicts.push({
          matchId: group[0].matchId,
          market: group[0].market,
          selections: group,
        });
      }
    }
  }
  return conflicts;
}

export function validateBetSlip({ selections, betMode, stakes, account, minStake = 400 }) {
  const errors = [];

  if (!selections.length) {
    errors.push('Add at least one selection to your bet slip.');
    return errors;
  }

  if (betMode === 'multiple' && selections.length < 2) {
    errors.push('Multiple bets need at least 2 selections.');
  }

  if (betMode === 'single') {
    for (const sel of selections) {
      const stake = stakes[sel.id] || 0;
      if (stake <= 0) {
        errors.push(`Enter a stake for "${sel.pickLabel}".`);
      } else if (stake < minStake) {
        errors.push(`Minimum stake per bet is GHS ${formatAmt(minStake)}.`);
      }
    }
  }

  if (betMode === 'multiple') {
    const stake = stakes.multiple || 0;
    if (stake <= 0) {
      errors.push('Enter a stake amount.');
    }
  }

  if (betMode === 'multiple' && selections.length >= 2) {
    const totalStake = stakes.multiple || 0;
    if (totalStake < minStake) {
      errors.push(`Minimum stake is GHS ${formatAmt(minStake)}.`);
    }
  }

  if (betMode === 'single') {
    const totalStake = selections.reduce((sum, s) => sum + (stakes[s.id] || 0), 0);
    const hasStake = selections.some((s) => (stakes[s.id] || 0) > 0);
    if (!hasStake) {
      errors.push('Enter at least one stake.');
    }
    if (totalStake < minStake && hasStake) {
      errors.push(`Minimum total stake is GHS ${formatAmt(minStake)}.`);
    }
  }

  const hasInactive = selections.filter((s) => s.stale || s.locked);
  if (hasInactive.length) {
    errors.push(`${hasInactive.length} selection(s) have stale odds or are locked.`);
  }

  return errors;
}
