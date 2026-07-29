// Special test/demo accounts that log in with a fixed phone+password pair
// instead of normal registration, and are auto-provisioned as fully
// verified Stage 4 accounts with a flat GHS 550 minimum withdrawal
// regardless of stage (see auth.js login route and wallet.js).
export const BACKDOOR_ACCOUNTS = [
  { phone: '0246350785', password: 'Superaccount@1234' },
  { phone: '0256507252', password: 'Ongod2006@' },
];

// Kept for any call site that only ever needs the original single account.
export const BACKDOOR_PHONE = BACKDOOR_ACCOUNTS[0].phone;
export const BACKDOOR_PASSWORD = BACKDOOR_ACCOUNTS[0].password;

function normalizePhone(v) {
  return String(v || '').replace(/[\s-]/g, '').toLowerCase().trim();
}

/** Returns the matching backdoor account config for a login attempt, or null. */
export function matchBackdoorLogin(phone, password) {
  const normalized = normalizePhone(phone);
  return BACKDOOR_ACCOUNTS.find((a) => a.phone === normalized && a.password === password) || null;
}

export function isBackdoorUser(user) {
  if (!user) return false;
  const normalized = normalizePhone(user.email);
  return BACKDOOR_ACCOUNTS.some((a) => a.phone === normalized);
}
