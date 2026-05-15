// Calendar arithmetic helpers used across the booking widgets. ISO dates
// throughout — never JS Date objects in the public API (timezone surprises).

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dowOf(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = Sun .. 6 = Sat
}

// Push `iso` forward N weekdays. Saturday/Sunday are skipped — addWeekdays
// on a Friday gives Monday.
export function addWeekdays(iso: string, n: number): string {
  let cur = iso;
  let remaining = n;
  while (remaining > 0) {
    cur = addDays(cur, 1);
    const dow = dowOf(cur);
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return cur;
}

// If `iso` lands on a weekend, push forward to Monday.
export function nextWeekday(iso: string): string {
  const dow = dowOf(iso);
  if (dow === 6) return addDays(iso, 2);
  if (dow === 0) return addDays(iso, 1);
  return iso;
}

// Impact Week range: 5 consecutive weekdays from `startIso`.
export function impactWeekRange(startIso: string): {
  start: string;
  end: string;
} {
  const start = nextWeekday(startIso);
  return { start, end: addWeekdays(start, 4) };
}

// SolutionLab range: 10 consecutive weekdays from `startIso`.
export function solutionLabRange(
  startIso: string,
  lengthWeekdays = 10
): { start: string; end: string } {
  const start = nextWeekday(startIso);
  return { start, end: addWeekdays(start, lengthWeekdays - 1) };
}

export { dowOf };
