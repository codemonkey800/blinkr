import { DEFAULT_SETTINGS } from '../settings/model';

/** The color for the nth pulse of a flash. Pulse 0 is the first color, and the list wraps. */
export function colorForPulse(colors: string[], pulseIndex: number): string {
  if (colors.length === 0) return DEFAULT_SETTINGS.colors[0];
  const index = ((Math.trunc(pulseIndex) % colors.length) + colors.length) % colors.length;
  return colors[index];
}
