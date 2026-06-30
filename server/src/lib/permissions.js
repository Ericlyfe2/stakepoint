export const PERMISSIONS = {
  // Sports
  'sports.view': 'View sports catalog',
  'sports.create': 'Create sports',
  'sports.edit': 'Edit sports',
  'sports.delete': 'Delete sports',
  'sports.reorder': 'Reorder sports',
  'sports.toggle': 'Enable/disable sports',

  // Leagues
  'leagues.view': 'View leagues',
  'leagues.create': 'Create leagues',
  'leagues.edit': 'Edit leagues',
  'leagues.delete': 'Delete leagues',
  'leagues.toggle': 'Enable/disable leagues',
  'leagues.feature': 'Feature/unfeature leagues',

  // Fixtures
  'fixtures.view': 'View fixtures',
  'fixtures.create': 'Create fixtures',
  'fixtures.edit': 'Edit fixtures',
  'fixtures.delete': 'Delete fixtures',
  'fixtures.import': 'Bulk import fixtures',
  'fixtures.reschedule': 'Reschedule fixtures',

  // Teams
  'teams.view': 'View teams',
  'teams.create': 'Create teams',
  'teams.edit': 'Edit teams',
  'teams.delete': 'Delete teams',

  // Markets & Odds
  'markets.view': 'View markets',
  'markets.create': 'Create markets',
  'markets.edit': 'Edit markets',
  'markets.delete': 'Delete markets',
  'odds.view': 'View odds',
  'odds.edit': 'Edit odds',
  'odds.suspend': 'Suspend/restore odds',
  'odds.bulk': 'Bulk odds operations',
  'odds.lock': 'Lock/unlock markets',

  // Trading
  'trading.liability': 'View liability & exposure',
  'trading.limits': 'Configure limits',
  'trading.suspend_all': 'Global trade suspension',
  'trading.acceptance': 'Configure bet acceptance rules',

  // Results & Settlement
  'results.view': 'View results & settlement queue',
  'results.enter': 'Enter results',
  'results.correct': 'Correct results',
  'results.settle': 'Trigger settlement',
  'results.resettle': 'Resettle bets',
  'results.reverse': 'Reverse settlement',

  // Live
  'live.manage': 'Manage live scores & events',
  'live.suspend': 'Suspend/resume live markets',

  // Users
  'users.view': 'View users',
  'users.edit': 'Edit users',
  'users.suspend': 'Suspend/ban users',
  'users.delete': 'Delete users',
  'users.impersonate': 'Impersonate users',
  'users.kyc': 'Manage KYC verification',
  'users.reset_password': 'Reset user passwords',
  'users.force_logout': 'Force user logout',
  'users.vip': 'Manage VIP status',
  'users.limits': 'Manage user limits',
  'users.tags': 'Manage user tags',
  'users.notes': 'Add user notes',

  // Finance
  'finance.view': 'View finance data',
  'finance.deposits.approve': 'Approve deposits',
  'finance.withdrawals.approve': 'Approve withdrawals',
  'finance.adjustments': 'Wallet adjustments',
  'finance.reports': 'View financial reports',
  'finance.reconciliation': 'Reconciliation tools',

  // Payments
  'payments.configure': 'Configure payment providers',
  'payments.limits': 'Configure payment limits',

  // Bets
  'bets.view': 'View bets',
  'bets.settle': 'Manually settle bets',
  'bets.cancel': 'Cancel bets',
  'bets.void': 'Void bets',
  'bets.note': 'Add bet notes',
  'bets.bulk': 'Bulk bet operations',

  // Bonuses & Promotions
  'bonuses.create': 'Create bonuses',
  'bonuses.edit': 'Edit bonuses',
  'bonuses.delete': 'Delete bonuses',
  'bonuses.issue': 'Issue bonuses to users',
  'bonuses.clawback': 'Clawback bonuses',
  'promotions.create': 'Create promotions',
  'promotions.edit': 'Edit promotions',
  'promotions.delete': 'Delete promotions',

  // Referrals
  'referrals.view': 'View referral data',
  'referrals.edit': 'Edit referral settings',
  'referrals.payouts': 'Manage referral payouts',

  // Booking Codes
  'codes.view': 'View booking codes',
  'codes.edit': 'Manage booking codes',
  'codes.invalidate': 'Invalidate booking codes',

  // Cashout
  'cashout.configure': 'Configure cashout settings',
  'cashout.disable': 'Emergency cashout disable',

  // Notifications
  'notifications.send': 'Send notifications',
  'notifications.schedule': 'Schedule notifications',
  'notifications.templates': 'Manage notification templates',

  // Content & CMS
  'cms.banners': 'Manage banners & sliders',
  'cms.pages': 'Manage content pages',
  'cms.announcements': 'Manage announcements',

  // Reporting
  'reports.view': 'View reports',
  'reports.export': 'Export reports',
  'reports.custom': 'Create custom reports',
  'reports.schedule': 'Schedule report delivery',

  // Security & Admin
  'admin.view': 'View admin accounts',
  'admin.create': 'Create admin accounts',
  'admin.edit': 'Edit admin accounts',
  'admin.suspend': 'Suspend admin accounts',
  'admin.roles': 'Manage admin roles',
  'admin.audit': 'View audit logs',
  'admin.sessions': 'Manage admin sessions',
  'admin.settings': 'Manage platform settings',
  'admin.maintenance': 'Toggle maintenance mode',
  'admin.feature_flags': 'Manage feature flags & kill switches',
  'admin.health': 'View system health',
  'admin.break_glass': 'Use break-glass elevation',

  // Support
  'support.tickets': 'Manage support tickets',
  'support.canned': 'Manage canned responses',

  // Fraud & Risk
  'fraud.view': 'View fraud signals',
  'fraud.configure': 'Configure fraud rules',
  'fraud.action': 'Take fraud actions',

  // Compliance
  'compliance.kyc': 'Manage KYC/AML',
  'compliance.sanctions': 'Sanctions screening',
  'compliance.rg': 'Responsible gambling controls',
  'compliance.reports': 'Compliance reporting',

  // Affiliates
  'affiliates.view': 'View affiliate data',
  'affiliates.edit': 'Edit affiliate settings',
  'affiliates.payouts': 'Manage affiliate payouts',

  // Jackpots
  'jackpots.create': 'Create jackpots',
  'jackpots.edit': 'Edit jackpots',
  'jackpots.delete': 'Delete jackpots',
  'jackpots.settle': 'Settle jackpots',

  // System
  'system.config': 'System configuration',
  'system.providers': 'Manage data providers',
  'system.webhooks': 'Manage webhooks',
  'system.backup': 'Backup & restore',
};

export const ROLE_PERMISSIONS = {
  super_admin: Object.keys(PERMISSIONS),

  trader: [
    'sports.view', 'sports.create', 'sports.edit', 'sports.toggle',
    'leagues.view', 'leagues.create', 'leagues.edit', 'leagues.toggle', 'leagues.feature',
    'fixtures.view', 'fixtures.create', 'fixtures.edit', 'fixtures.import', 'fixtures.reschedule',
    'teams.view', 'teams.create', 'teams.edit',
    'markets.view', 'markets.create', 'markets.edit', 'markets.delete',
    'odds.view', 'odds.edit', 'odds.suspend', 'odds.bulk', 'odds.lock',
    'trading.liability', 'trading.limits', 'trading.suspend_all', 'trading.acceptance',
    'results.view', 'results.enter', 'results.correct',
    'live.manage', 'live.suspend',
    'bets.view',
  ],

  risk_manager: [
    'sports.view', 'leagues.view', 'fixtures.view', 'teams.view', 'markets.view', 'odds.view',
    'trading.liability', 'trading.limits', 'trading.suspend_all', 'trading.acceptance',
    'odds.suspend', 'odds.lock',
    'results.view',
    'users.view',
    'bets.view',
    'fraud.view', 'fraud.configure', 'fraud.action',
    'compliance.rg',
  ],

  finance_admin: [
    'sports.view', 'leagues.view', 'fixtures.view', 'teams.view',
    'users.view',
    'finance.view', 'finance.deposits.approve', 'finance.withdrawals.approve',
    'finance.adjustments', 'finance.reports', 'finance.reconciliation',
    'payments.configure', 'payments.limits',
    'bets.view',
    'reporting.view', 'reporting.export',
    'referrals.view', 'referrals.payouts',
  ],

  compliance_officer: [
    'sports.view', 'leagues.view', 'fixtures.view',
    'users.view', 'users.kyc', 'users.suspend', 'users.tags', 'users.notes',
    'bets.view',
    'compliance.kyc', 'compliance.sanctions', 'compliance.rg', 'compliance.reports',
    'fraud.view', 'fraud.action',
    'referrals.view',
    'support.tickets',
    'reports.view', 'reports.export',
    'admin.audit',
  ],

  support_agent: [
    'sports.view', 'leagues.view', 'fixtures.view',
    'users.view', 'users.edit', 'users.impersonate', 'users.notes', 'users.tags',
    'bets.view', 'bets.note',
    'support.tickets', 'support.canned',
    'codes.view',
  ],

  marketing_manager: [
    'sports.view', 'leagues.view', 'fixtures.view',
    'bonuses.create', 'bonuses.edit', 'bonuses.delete',
    'promotions.create', 'promotions.edit', 'promotions.delete',
    'notifications.send', 'notifications.schedule', 'notifications.templates',
    'cms.banners', 'cms.pages', 'cms.announcements',
    'referrals.view', 'referrals.edit',
    'reports.view', 'reports.export',
    'admin.audit',
    'affiliates.view',
  ],

  readonly_auditor: [
    'sports.view', 'leagues.view', 'fixtures.view', 'teams.view',
    'markets.view', 'odds.view',
    'users.view',
    'finance.view',
    'bets.view',
    'reports.view', 'reports.export',
    'admin.audit', 'admin.health',
    'referrals.view',
    'codes.view',
    'fraud.view',
    'compliance.reports',
    'affiliates.view',
  ],
};
