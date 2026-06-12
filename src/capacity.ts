import type { Allocation, AssigneeBooking } from "./types.js";
import { addDays, dowOf } from "./dates.js";

// Highest allocation percent this person carries on any single weekday
// in [start, end]. Sums every allocation covering each weekday and returns
// the daily max — used as the existing-utilization floor when checking
// whether a new commitment would push the person past 100%.
export function maxAllocPercentInRange(
  personId: number,
  start: string,
  end: string,
  allocations: Allocation[]
): number {
  const relevant = allocations.filter(
    (a) =>
      a.person_id === personId &&
      a.start_date <= end &&
      a.end_date >= start
  );
  if (relevant.length === 0) return 0;
  let max = 0;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const dow = dowOf(day);
    if (dow === 0 || dow === 6) continue;
    let sum = 0;
    for (const a of relevant) {
      if (a.start_date <= day && a.end_date >= day) sum += a.percent;
    }
    if (sum > max) max = sum;
  }
  return max;
}

export function rangeHasCapacity(
  assignees: AssigneeBooking[],
  start: string,
  end: string,
  allocations: Allocation[]
): boolean {
  for (const a of assignees) {
    if (a.percent <= 0) continue;
    const existing = maxAllocPercentInRange(
      a.personId,
      start,
      end,
      allocations
    );
    if (existing + a.percent > (a.maxPercent ?? 100)) return false;
  }
  return true;
}
