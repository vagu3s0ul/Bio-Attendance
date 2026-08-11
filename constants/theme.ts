/**
 * SPSC Essence — the app design system.
 * Mirror of the approved UI screens (login, teacher dashboard, daily entry
 * list). Light mode only, high-clarity canvas (#FAFAFA), white cards with
 * soft diffused shadows, Inter typography, and a single primary action color
 * (#2D6CDF) reserved for CTAs and active states.
 */
export const COLORS = {
  // Canvas & surfaces
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceLow: '#F3F3F3',
  surfaceHigh: '#E8E8E8',
  outline: '#EEEEEE',

  // Brand / primary
  primary: '#2D6CDF',
  onPrimary: '#FFFFFF',
  primarySoft: '#D9E2FF', // primary-fixed
  primaryDeep: '#0053C1',

  // Text
  text: '#1A1A1B',
  textMuted: '#717172',
  textFaint: '#9AA0A6',

  // Semantic
  success: '#27AE60',
  compliant: '#006D37', // secondary — compliant chip fill
  warning: '#F39C12',
  warningBg: '#FFF9E6',
  warningText: '#805D00',
  danger: '#E74C3C',
  dangerSoft: '#FDECEA',
  neutralChip: '#EEEEEE', // unmarked chip fill
  neutralChipText: '#717172',

  // Overlays
  overlay: 'rgba(26, 26, 27, 0.45)',
};

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 };
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Font family + weight tokens from the design system. */
export const FONT = {
  family: 'Inter',
  display: 'Inter_300Light', // display-lg / headlines (light, airy)
  regular: 'Inter_400Regular',
  medium: 'Inter_600SemiBold', // label-caps / emphasis
  bold: 'Inter_700Bold',
} as const;

/** label-caps: small uppercase micro-labels. */
export const LABEL_CAPS = {
  fontFamily: FONT.medium,
  fontSize: 12,
  fontWeight: '600' as const,
  letterSpacing: 0.6,
  textTransform: 'uppercase' as const,
  color: COLORS.textMuted,
};

/** Soft diffused elevation — shadows are the only depth cue. */
export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
  },
  lifted: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
};

export default { COLORS, RADIUS, SPACING, FONT, LABEL_CAPS, SHADOW };
