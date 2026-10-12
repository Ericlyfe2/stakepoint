import useMediaQuery from '../../premium/useMediaQuery.js';
import StitchSportsbook from './StitchSportsbook.jsx';
import StitchMobile from './StitchMobile.jsx';

/* ---------------------------------------------------------------------------
   Primary home surface.

   The premium sportsbook is now the site home. The desktop port hides its
   betslip rail below 1024px and has no bottom dock, so compact viewports get
   the dedicated mobile port (bottom betslip + tab bar) instead — same data,
   same betslip engine, correct control at every width.
   ------------------------------------------------------------------------- */

export default function StitchHome() {
  const compact = useMediaQuery('(max-width: 1023px)');
  return compact ? <StitchMobile /> : <StitchSportsbook />;
}
