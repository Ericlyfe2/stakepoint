/**
 * Minimal stroked icon set used across the admin UI.
 * Single-purpose components keep imports explicit and shake well.
 */
const wrap = (path, viewBox = '0 0 24 24') => function Icon({ size = 18, ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {path}
    </svg>
  );
};

export const IconDashboard = wrap(
  <><path d="M3 12 12 4l9 8" /><path d="M5 10v10h14V10" /></>
);
export const IconUsers = wrap(
  <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.6" /><path d="M14.5 20a5 5 0 0 1 7 0" /></>
);
export const IconReceipt = wrap(
  <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h4" /></>
);
export const IconChart = wrap(
  <><path d="M4 20V8M10 20V4M16 20v-7M22 20H2" /></>
);
export const IconShield = wrap(
  <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>
);
export const IconCash = wrap(
  <><rect x="2.5" y="6.5" width="19" height="11" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5h.01M18 14.5h.01" /></>
);
export const IconBell = wrap(
  <><path d="M6 8a6 6 0 1 1 12 0v5l1.5 3h-15L6 13z" /><path d="M10 18a2 2 0 0 0 4 0" /></>
);
export const IconLifebuoy = wrap(
  <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="M4.6 4.6 9 9M15 15l4.4 4.4M4.6 19.4 9 15M15 9l4.4-4.4" /></>
);
export const IconCog = wrap(
  <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>
);
export const IconSearch = wrap(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconArrowRight = wrap(<><path d="M5 12h14M13 5l7 7-7 7" /></>);
export const IconArrowUp = wrap(<><path d="M12 19V5M5 12l7-7 7 7" /></>);
export const IconArrowDown = wrap(<><path d="M12 5v14M19 12l-7 7-7-7" /></>);
export const IconSun = wrap(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9 6.3 6.3M17.7 17.7l1.4 1.4M4.9 19.1 6.3 17.7M17.7 6.3l1.4-1.4" /></>);
export const IconMoon = wrap(<><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></>);
export const IconMenu = wrap(<><path d="M3 6h18M3 12h18M3 18h18" /></>);
export const IconClose = wrap(<><path d="M6 6l12 12M6 18 18 6" /></>);
export const IconChevronRight = wrap(<><path d="m9 6 6 6-6 6" /></>);
export const IconLogout = wrap(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>);
export const IconCheck = wrap(<><path d="m20 6-11 11-5-5" /></>);
export const IconAlert = wrap(<><path d="M12 3 2 21h20z" /><path d="M12 10v4M12 17v.01" /></>);
export const IconLive = wrap(<><circle cx="12" cy="12" r="3" /><path d="M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7" /></>);
export const IconCalendar = wrap(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>);
export const IconFilter = wrap(<><path d="M3 5h18l-7 9v6l-4-2v-4z" /></>);
export const IconDownload = wrap(<><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></>);
export const IconRefresh = wrap(<><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></>);
export const IconLightning = wrap(<><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></>);
export const IconKey = wrap(<><circle cx="8" cy="15" r="4" /><path d="M21 3 11 13M17 7l3 3M14 10l3 3" /></>);
export const IconActivity = wrap(<><path d="M22 12h-4l-3 8-6-16-3 8H2" /></>);
export const IconBot = wrap(<><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M9 14h.01M15 14h.01M12 2v6M9 5h6" /></>);
export const IconBook = wrap(<><path d="M4 4h11a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z" /><path d="M4 16a4 4 0 0 1 4-4h11" /></>);
export const IconSparkles = wrap(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.5 2.5M16 16l2.5 2.5M18.5 5.5 16 8M8 16l-2.5 2.5" /></>);
export const IconEye = wrap(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3.5" /></>);
export const IconBan = wrap(<><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>);
export const IconSettle = wrap(<><path d="M3 12h18M12 3v18" /><circle cx="12" cy="12" r="9" /></>);
export const IconEdit = wrap(<><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>);
export const IconStar = wrap(<><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></>);

export const IconTarget = wrap(<><circle cx="12" cy="12" r="9" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M8.5 8.5l2 2M13.5 13.5l2 2" /></>);
export const IconFlag = wrap(<><path d="M4 21V3l13 4-4 3 4 3z" /></>);
export const IconAward = wrap(<><circle cx="12" cy="9" r="5" /><path d="M8 21h8M12 14v7M6 4l1-2h10l1 2-1 2H7z" /></>);
export const IconTrending = wrap(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>);
export const IconShieldOff = wrap(<><path d="M12 3 4 6v6c0 5 3.5 8 8 9 1.2-.3 2.3-.8 3.3-1.5M2 2l20 20" /></>);
export const IconLock = wrap(<><rect x="4" y="9" width="16" height="12" rx="2" /><path d="M9 9V6a3 3 0 0 1 5.5-1.7M9 15h6" /></>);
export const IconGift = wrap(<><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><path d="M12 7V3M8 7a3 3 0 1 1 0-6 4 4 0 0 0 4 3M16 7a3 3 0 1 0 0-6 4 4 0 0 1-4 3" /></>);
export const IconUsers2 = wrap(<><path d="M14 19a6 6 0 0 0-12 0" /><circle cx="8" cy="9" r="4" /><path d="M16 21v-1a4 4 0 0 0-4-4h-1" /><path d="M18 21v-1a6 6 0 0 0-3-5" /><circle cx="17" cy="7" r="3" /></>);
export const IconCode = wrap(<><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>);
export const IconSend = wrap(<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>);
export const IconBarChart = wrap(<><path d="M4 20V8M10 20V4M16 20v-7M22 20H2" /></>);
export const IconFileText = wrap(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M8 13h8M8 17h6" /></>);
export const IconSettings = wrap(<><circle cx="12" cy="12" r="3.5" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>);
export const IconServer = wrap(<><rect x="3" y="3" width="18" height="6" rx="2" /><rect x="3" y="9" width="18" height="6" rx="2" /><rect x="3" y="15" width="18" height="6" rx="2" /><circle cx="8" cy="6" r="1.5" /><circle cx="8" cy="12" r="1.5" /><circle cx="8" cy="18" r="1.5" /></>);
export const IconPlus = wrap(<><path d="M12 5v14M5 12h14" /></>);
export const IconTrash = wrap(<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>);
