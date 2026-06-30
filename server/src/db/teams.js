import { createStore } from './store.js';

const store = createStore('teams', { teams: {} });

export function listTeams(filters = {}) {
  const all = Object.values(store.get('teams') || {});
  let rows = all;
  if (filters.sport) rows = rows.filter((t) => t.sport === filters.sport);
  if (filters.q) {
    const n = filters.q.toLowerCase();
    rows = rows.filter((t) => t.name?.toLowerCase().includes(n) || t.shortName?.toLowerCase().includes(n));
  }
  return rows.sort((a, b) => a.name?.localeCompare(b.name));
}

export function getTeam(id) {
  const all = store.get('teams') || {};
  return all[id] || null;
}

export function createTeam(data) {
  const all = store.get('teams') || {};
  const id = `tm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const team = {
    id,
    name: data.name,
    shortName: data.shortName || data.name?.slice(0, 3).toUpperCase(),
    sport: data.sport || 'football',
    country: data.country || '',
    logoUrl: data.logoUrl || '',
    colors: data.colors || '',
    venue: data.venue || '',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.set('teams', { ...all, [id]: team });
  return team;
}

export function updateTeam(id, patch) {
  const all = store.get('teams') || {};
  const existing = all[id];
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  store.set('teams', { ...all, [id]: updated });
  return updated;
}

export function deleteTeam(id) {
  const all = store.get('teams') || {};
  if (!all[id]) return false;
  const { [id]: _, ...rest } = all;
  store.set('teams', rest);
  return true;
}
