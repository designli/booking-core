import type { Allocation, AssigneeBooking } from "./types.js";
import { addWeekdays, nextWeekday } from "./dates.js";
import { rangeHasCapacity } from "./capacity.js";

// Walk forward weekday by weekday from `fromIso` and return up to `count`
// start dates where every assignee can fit their new percent. Each
// candidate spans `projectLengthWeekdays` consecutive weekdays. Pass
// `excludeStartDates` to skip weekdays that already have an IW/SL kickoff
// on them — keeps the suggestions staggered so two discovery items don't
// kick off the same day.
export function findAvailableStarts(
  assignees: AssigneeBooking[],
  projectLengthWeekdays: number,
  fromIso: string,
  allocations: Allocation[],
  count: number,
  options?: {
    excludeStartDates?: ReadonlySet<string>;
    maxDaysOut?: number;
  }
): string[] {
  const excluded = options?.excludeStartDates ?? new Set<string>();
  const maxDaysOut = options?.maxDaysOut ?? 365;
  const out: string[] = [];
  let day = nextWeekday(fromIso);
  for (let i = 0; i < maxDaysOut && out.length < count; i++) {
    if (excluded.has(day)) {
      day = addWeekdays(day, 1);
      continue;
    }
    const end = addWeekdays(day, projectLengthWeekdays - 1);
    if (rangeHasCapacity(assignees, day, end, allocations)) {
      out.push(day);
    }
    day = addWeekdays(day, 1);
  }
  return out;
}

// Set of weekdays on which an Impact Week or SolutionLab project already
// kicks off. Derived from allocation start dates because every shadow-
// project allocation shares the project's start_date. Used by the Add
// dialogs to keep their chip suggestions from doubling up two kickoffs on
// a single day.
export function discoveryKickoffDates(
  allocations: Allocation[]
): ReadonlySet<string> {
  const set = new Set<string>();
  for (const a of allocations) {
    if (a.source === "impact_week" || a.source === "solution_lab") {
      set.add(a.start_date);
    }
  }
  return set;
}
