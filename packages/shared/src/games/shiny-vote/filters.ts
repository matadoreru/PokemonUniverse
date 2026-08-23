/**
 * Central palette for fake shinies. Values are intentionally pronounced while
 * keeping transparent sprites readable against both light and dark surfaces.
 */
export const AUTHENTIC_SHINY_FILTER = 'brightness(1) saturate(1) contrast(1) hue-rotate(0deg)';

export const FAKE_SHINY_FILTERS = [
  'hue-rotate(64deg) saturate(2.15) contrast(1.2) brightness(1.06)',
  'hue-rotate(137deg) saturate(2.3) contrast(1.16) brightness(0.96)',
  'hue-rotate(211deg) saturate(2.05) contrast(1.24) brightness(1.08)',
  'hue-rotate(278deg) saturate(2.4) contrast(1.18) brightness(0.94)',
  'hue-rotate(329deg) saturate(2.2) contrast(1.22) brightness(1.1)',
  'hue-rotate(25deg) saturate(1.95) contrast(1.28) brightness(0.92)',
] as const;

export function fakeShinyFilter(index: number): string {
  return FAKE_SHINY_FILTERS[index % FAKE_SHINY_FILTERS.length]!;
}
