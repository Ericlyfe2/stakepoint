import nodemailer from 'nodemailer';
import { SMTP } from '../config/env.js';
import { log } from '../utils/logger.js';

let transporter = null;

if (SMTP.enabled) {
  transporter = nodemailer.createTransport({
    host: SMTP.host,
    port: SMTP.port,
    secure: SMTP.secure,
    auth: SMTP.user ? { user: SMTP.user, pass: SMTP.pass } : undefined,
  });
}

export async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    // Dev fallback — log only masked info, never the full OTP.
    const masked = String(text || '').replace(/\d{6,}/g, (m) => m.slice(0, 2) + '••••' + m.slice(-1));
    log.info(`[email-dev] To: ${to}\n  Subject: ${subject}\n  Body: ${masked}`);
    return { dev: true };
  }
  const info = await transporter.sendMail({ from: SMTP.from, to, subject, text, html });
  log.info(`[email] sent ${info.messageId} -> ${to}`);
  return info;
}

export async function sendOtp(to, code, purpose = 'verify') {
  const subjectMap = {
    verify:        'Your BetXentra verification code',
    'reset':       'Reset your BetXentra password',
    'login':       'BetXentra login verification',
  };
  const subject = subjectMap[purpose] || 'Your BetXentra code';
  const text = `Your BetXentra code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif">
    <h2 style="color:#ffb800">BetXentra</h2>
    <p>Your one-time code is:</p>
    <p style="font-size:28px;font-weight:800;letter-spacing:6px;background:#000000;color:#ffb800;padding:16px 24px;border-radius:12px;display:inline-block">${code}</p>
    <p style="color:#666;font-size:13px;margin-top:16px">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
  </div>`;
  return sendMail({ to, subject, text, html });
}
