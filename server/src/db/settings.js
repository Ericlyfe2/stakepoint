import { createStore } from './store.js';

const store = createStore('settings', {});

const DEFAULTS = {
  maintenance: false,
  maintenanceMessage: 'Platform is undergoing scheduled maintenance. Please check back shortly.',
  // "No login" kill switch. When on, every player login/register entry point
  // answers 503 with code LOGIN_DISABLED. Admin sign-in is deliberately exempt
  // so the owner can never be locked out of /admin (see routes/auth.js).
  loginDisabled: false,
  signupsOpen: true,
  defaultOddsSource: 'auto',
  minDeposit: 300,
  minWithdraw: 550,
  maxSingleStake: 1000000,
  maxMultipleStake: 500000,
  maxSystemStake: 250000,
  bonusRate: 0.08,
  referralBonus: 10,
  contactEmail: 'support@betxentra.gh',
  // PayBill details shown in the deposit flow. Editable from
  // Admin → Settings so ops can rotate merchants without a redeploy.
  paybillNumber: '754991',
  paybillName: 'NOVENTRA TECHNOLOGIES',
  featureJackpot: true,
  featureCasino: true,
  featureVirtuals: true,
  featurePromotions: true,
  featureLiveBetting: true,
};

export function getSettings() {
  const current = store.get('platform') || {};
  return { ...DEFAULTS, ...current };
}

export function updateSettings(patch) {
  const current = store.get('platform') || {};
  const merged = { ...current, ...patch };
  store.set('platform', merged);
  // Return the fully-resolved view (defaults + stored) so callers such as the
  // admin Settings page can replace their state wholesale after a save.
  return getSettings();
}
