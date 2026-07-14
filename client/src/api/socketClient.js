/**
 * Storefront Socket.IO client.
 *
 * Lazy connection — only opens when first subscribe() is called so visitors
 * who never view the live page don't pay the cost. Token (if any) is read
 * from the existing localStorage key used by betApi.js.
 */
import { io } from 'socket.io-client';
import { getAccess } from './betApi.js';

const devUrl = 'http://127.0.0.1:4000';
const URL = import.meta.env.VITE_API_BASE || (
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? devUrl
    : (typeof window !== 'undefined' ? window.location.origin : devUrl)
);

let socket = null;
let connectAttempted = false;

export function getSocket() {
  if (socket && socket.connected) return socket;
  if (connectAttempted && socket) return socket;
  connectAttempted = true;
  socket = io(`${URL}/live`, {
    path: '/socket.io',
    // Polling first, then upgrade — forcing 'websocket' first races the
    // handshake against a cold-starting/proxied host (Render free tier) and
    // frequently dies with "WebSocket is closed before the connection is
    // established". Polling establishes reliably over plain HTTP, then
    // engine.io upgrades to a real WebSocket once the connection is warm.
    transports: ['polling', 'websocket'],
    auth: { token: getAccess() || undefined },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1200,
    reconnectionDelayMax: 8000,
  });
  return socket;
}

export function refreshAuth() {
  if (!socket) return;
  // Re-handshake with the new token by closing + reopening.
  try { socket.auth = { token: getAccess() || undefined }; socket.disconnect().connect(); }
  catch { /* ignore */ }
}

export function subscribeFixtures(ids = []) {
  const s = getSocket();
  s.emit('subscribe', { fixtureIds: ids });
}
export function unsubscribeFixtures(ids = []) {
  if (!socket) return;
  socket.emit('unsubscribe', { fixtureIds: ids });
}
export function subscribeSports(ids = []) {
  const s = getSocket();
  s.emit('subscribe', { sportIds: ids });
}
export function unsubscribeSports(ids = []) {
  if (!socket) return;
  socket.emit('unsubscribe', { sportIds: ids });
}

export function onLive(event, handler) {
  const s = getSocket();
  s.on(event, handler);
  return () => s.off(event, handler);
}

export function disconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
  connectAttempted = false;
}
