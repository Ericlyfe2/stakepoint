import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RATE_LIMITS } from '../config/env.js';

const standardOpts = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again shortly.' },
};

const emailKey = (req) =>
  `${ipKeyGenerator(req.ip)}|${(req.body?.email || '').toLowerCase()}`;

export const generalLimiter = rateLimit({
  ...standardOpts,
  windowMs: 60 * 1000,
  limit: 300,
});

export const loginLimiter = rateLimit({
  ...standardOpts,
  windowMs: 15 * 60 * 1000,
  limit: RATE_LIMITS.loginMax,
  keyGenerator: emailKey,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

export const registerLimiter = rateLimit({
  ...standardOpts,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: { error: 'Too many account-creation attempts from your network. Try again in an hour.' },
});

export const otpRequestLimiter = rateLimit({
  ...standardOpts,
  windowMs: 10 * 60 * 1000,
  limit: RATE_LIMITS.otpMax,
  keyGenerator: emailKey,
  message: { error: 'Too many OTP requests. Try again in 10 minutes.' },
});

export const otpVerifyLimiter = rateLimit({
  ...standardOpts,
  windowMs: 10 * 60 * 1000,
  limit: 10,
  keyGenerator: emailKey,
  message: { error: 'Too many verification attempts. Try again later.' },
});
