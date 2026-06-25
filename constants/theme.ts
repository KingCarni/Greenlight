export const Colors = {
  // Base
  background: '#0a0a0a',
  surface: '#111111',
  surfaceElevated: '#1a1a1a',
  surfaceBorder: '#2a2a2a',

  // Accent — film-green (clapperboard)
  primary: '#00c853',
  primaryDim: '#007a33',
  primaryMuted: '#00c85320',

  // Text
  textPrimary: '#f0f0f0',
  textSecondary: '#888888',
  textMuted: '#555555',

  // Status
  error: '#ff4444',
  warning: '#ffaa00',
  success: '#00c853',

  // Overlays
  overlay: 'rgba(0,0,0,0.7)',
  scrim: 'rgba(0,0,0,0.4)',
} as const;

export const Typography = {
  fontSizeXs: 11,
  fontSizeSm: 13,
  fontSizeMd: 15,
  fontSizeLg: 17,
  fontSizeXl: 20,
  fontSize2xl: 24,
  fontSize3xl: 30,

  fontWeightRegular: '400' as const,
  fontWeightMedium: '500' as const,
  fontWeightSemibold: '600' as const,
  fontWeightBold: '700' as const,

  lineHeightTight: 1.2,
  lineHeightNormal: 1.5,
  lineHeightRelaxed: 1.75,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 20,
  full: 9999,
} as const;

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;
