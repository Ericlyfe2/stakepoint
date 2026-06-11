import { createStore } from './store.js';

const store = createStore('settings', {});

const DEFAULTS = {
  maintenance: false,
  maintenanceMessage: 'Platform is undergoing scheduled maintenance. Please check back shortly.',
  signupsOpen: true,
  defaultOddsSource: 'auto',
  minDeposit: 300,
  minWithdraw: 550,
  maxSingleStake: 1000000,
  maxMultipleStake: 500000,
  maxSystemStake: 250000,
  bonusRate: 0.08,
  referralBonus: 10,
  contactEmail: 'support@xenbet.gh',
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
  return merged;
}
