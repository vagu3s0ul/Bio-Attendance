/**
 * Bio Attendance — Material Design 3 (Material You) design system.
 * Light mode only. Cool-light canvas (#F5F7FA), white cards, Deep Royal Blue
 * (#1E4DB7) primary brand anchor, and an unambiguous status palette
 * (Present green / Absent red / Leave amber) for rapid field scanning.
 */
export const COLORS = {
  // Canvas & surfaces (M3 neutral tonal scale)
  background: '#F5F7FA', // canvas
  surface: '#FFFFFF', // cards, sheets, bottom nav deck
  surfaceLow: '#F2F4F7',
  surfaceHigh: '#E6E8EB',
  outline: '#E2E8F0', // hairlines & card perimeters

  // Brand / primary (Deep Royal Blue)
  primary: '#1E4DB7',
  onPrimary: '#FFFFFF',
  primarySoft: '#DBEAFE', // M3 pill indicator / selected chip
  primaryDeep: '#003694', // primary token (pressed / emphasis)

  // Secondary (Deep Cyan)
  secondary: '#0E7490',

  // Text
  text: '#0F172A', // slate navy
  textMuted: '#64748B', // slate
  textFaint: '#94A3B8',

  // Semantic — status palette with soft containers
  success: '#16A34A', // Present
  successSoft: '#DCFCE7',
  compliant: '#16A34A', // compliant chip fill
  warning: '#D97706', // Leave / pending
  warningBg: '#FEF3C7',
  warningText: '#92400E',
  danger: '#DC2626', // Absent / Defaulter
  dangerSoft: '#FEE2E2',
  neutralChip: '#F1F5F9', // unmarked chip fill
  neutralChipText: '#475569',
  chipText: '#475569',
  chipBorder: '#E2E8F0',
  chipSelected: '#1E4DB7',

  // Overlays
  overlay: 'rgba(15, 23, 42, 0.45)',

  // 2026 UI refresh tokens (soft-field / pill language from the new mockups)
  field: '#F1F3F7', // filled input wells
  chipIdle: '#EEF0F4', // unselected segmented chips
  lavender: '#E8ECFB', // "official portal" micro-pill
  mintSoft: '#E7F6EF',
  skySoft: '#E6F1FB',
  peachSoft: '#FDF0E3',
  roseSoft: '#FCE9EA',
  violetSoft: '#EFEAFB',
  limeSoft: '#EAF6E6',
};

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 };
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

/**
 * Material 3 palette from the 2026 UI mockups (step_6_defaulters + DESIGN.md).
 * Exact hex values — added as a separate token set so existing screens that use
 * COLORS.* are untouched. Primary is the deep institutional blue #003694.
 */
export const M3 = {
  surface: '#f7f9fc',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f2f4f7',
  surfaceContainer: '#eceef1',
  surfaceContainerHigh: '#e6e8eb',
  surfaceContainerHighest: '#e0e3e6',
  onSurface: '#191c1e',
  onSurfaceVariant: '#434653',
  outline: '#747684',
  outlineVariant: '#c4c6d5',
  primary: '#003694',
  onPrimary: '#ffffff',
  primaryContainer: '#1e4db7',
  onPrimaryContainer: '#b8c8ff',
  primaryFixed: '#dbe1ff',
  onPrimaryFixed: '#00174b',
  secondary: '#006781',
  secondaryContainer: '#8fdfff',
  onSecondaryContainer: '#00647d',
  tertiary: '#613100',
  tertiaryFixed: '#ffdcc3',
  onTertiaryFixed: '#2f1500',
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  whatsapp: '#25D366',
} as const;

/** M3 tonal elevation — delicate low-opacity ambient shadows. */
export const SHADOW = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  lifted: {
    shadowColor: '#1E4DB7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
};

export default { COLORS, RADIUS, SPACING, FONT, LABEL_CAPS, SHADOW };
