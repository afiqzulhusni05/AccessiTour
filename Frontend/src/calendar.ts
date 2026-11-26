// Small date helpers shared by the month calendars (a guide's own availability, and a guide's free days on a trip).

/** Local YYYY-MM-DD (not UTC, so late-evening dates don't shift a day). */
export const iso = (d: Date) => d.toLocaleDateString("sv");

/** The grid of dates shown for a month, in weeks starting on Sunday; days outside the month are null. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(iso(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Every date from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00`); d <= new Date(`${to}T00:00`); d.setDate(d.getDate() + 1)) out.push(iso(d));
  return out;
}

/** Narrow weekday names, Sunday first, in `lang`. */
export const weekdayNames = (lang: string) =>
  [...Array(7)].map((_, i) => new Date(2024, 8, 1 + i).toLocaleDateString(lang, { weekday: "narrow" })); // 1 Sep 2024 was a Sunday
