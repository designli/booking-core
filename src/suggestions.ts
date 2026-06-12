import type { Allocation, AssigneeBooking, PtoDay } from "./types.js";
import { addWeekdays, nextWeekday } from "./dates.js";
import { rangeHasCapacity } from "./capacity.js";

// The kickoff blackout: whoever runs the kickoff must be PTO-free on day 1
// of the engagement (the kickoff day itself). PTO on any later day is fair
// game (at most a soft warning in consumer UIs).
export const KICKOFF_PTO_BLACKOUT_WEEKDAYS = 1;

// Does `personId` have PTO covering `day`?
export function hasPtoOnDay(
  personId: number,
  day: string,
  pto: PtoDay[]
): boolean {
  return pto.some(
    (p) => p.person_id === personId && p.start_date <= day && p.end_date >= day
  );
}

// Would an engagement starting `startIso` put its kickoff on `personId`'s
// PTO? Checks the first KICKOFF_PTO_BLACKOUT_WEEKDAYS weekdays (currently
// just the kickoff day). This is the hard scheduling rule shared by the
// resource tracker and the pitch-deck booking widgets.
export function ptoBlocksKickoff(
  personId: number,
  startIso: string,
  pto: PtoDay[]
): boolean {
  const start = nextWeekday(startIso);
  const end = addWeekdays(start, KICKOFF_PTO_BLACKOUT_WEEKDAYS - 1);
  return pto.some(
    (p) =>
      p.person_id === personId && p.start_date <= end && p.end_date >= start
  );
}

// Walk forward weekday by weekday from `fromIso` and return up to `count`
// start dates where every assignee can fit their new percent. Each
// candidate spans `projectLengthWeekdays` consecutive weekdays. Pass
// `excludeStartDates` to skip weekdays that already have an IW/SL kickoff
// on them — keeps the suggestions staggered so two discovery items don't
// kick off the same day. Pass `pto` + `kickoffPersonIds` to also skip
// start dates where anyone who must run the kickoff has PTO on the
// kickoff day (see ptoBlocksKickoff).
export function findAvailableStarts(
  assignees: AssigneeBooking[],
  projectLengthWeekdays: number,
  fromIso: string,
  allocations: Allocation[],
  count: number,
  options?: {
    excludeStartDates?: ReadonlySet<string>;
    maxDaysOut?: number;
    pto?: PtoDay[];
    kickoffPersonIds?: readonly number[];
  }
): string[] {
  const excluded = options?.excludeStartDates ?? new Set<string>();
  const maxDaysOut = options?.maxDaysOut ?? 365;
  const pto = options?.pto ?? [];
  const kickoffPersonIds = options?.kickoffPersonIds ?? [];
  const out: string[] = [];
  let day = nextWeekday(fromIso);
  for (let i = 0; i < maxDaysOut && out.length < count; i++) {
    if (
      excluded.has(day) ||
      kickoffPersonIds.some((id) => ptoBlocksKickoff(id, day, pto))
    ) {
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
