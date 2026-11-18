export function fmtTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return "TBD";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date(iso));
}
export function fmtDay(iso: string | null | undefined, tz: string): string {
  if (!iso) return "Unscheduled";
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date(iso));
}
export function dayKey(iso: string | null | undefined, tz: string): string {
  if (!iso) return "unscheduled";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).format(new Date(iso));
}
export function fmtDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));
}
/** Convert a wall-clock time in `tz` (YYYY-MM-DDTHH:mm) to an ISO instant. */
export function zonedToISO(local: string, tz: string): string {
  const guess = new Date(`${local}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asTz = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asTz - guess.getTime())).toISOString();
}
/** ISO instant to wall-clock YYYY-MM-DDTHH:mm in `tz` (for datetime-local inputs). */
export function isoToZoned(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
