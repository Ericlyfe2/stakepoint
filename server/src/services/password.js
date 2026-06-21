import bcrypt from 'bcrypt';

const ROUNDS = 12;

export const hashPassword   = (pw) => bcrypt.hash(pw, ROUNDS);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function passwordIssues(pw) {
  const issues = [];
  if (typeof pw !== 'string')                issues.push('Password is required.');
  else {
    if (pw.length < 8)                       issues.push('Use at least 8 characters.');
    if (pw.length > 128)                     issues.push('Password must be at most 128 characters.');
    if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw)) issues.push('Mix upper- and lower-case letters.');
    if (!/\d/.test(pw))                      issues.push('Include at least one digit.');
  }
  return issues;
}
