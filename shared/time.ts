import { DateTime } from 'luxon';
export const ZONE = 'Europe/London';
export function localToISO(value: string, occurrence: 'earlier' | 'later' = 'earlier'): string {
  const dt = DateTime.fromISO(value, {zone: ZONE});
  if (!dt.isValid || dt.toFormat("yyyy-MM-dd'T'HH:mm") !== value.slice(0,16)) throw new Error('This local time does not exist in Europe/London because the clocks change. Choose another time.');
  const possibilities = dt.getPossibleOffsets().sort((a,b) => a.toMillis() - b.toMillis());
  return (occurrence === 'later' ? possibilities.at(-1)! : possibilities[0]).toISO()!;
}
export function localNow() { return DateTime.now().setZone(ZONE); }
export function formatTime(iso: string) {return DateTime.fromISO(iso).setZone(ZONE).toFormat('HH:mm');}
