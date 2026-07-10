import type {
  Allocation,
  AllocationSource,
  AssigneeBooking,
  PtoDay,
} from "./types.js";
import { addWeekdays, nextWeekday } from "./dates.js";
import { maxAllocPercentInRange, rangeHasCapacity } from "./capacity.js";
import { DISCOVERY_INJECTION_SOURCES } from "./constants.js";

const INJECTION_SOURCE_SET: ReadonlySet<AllocationSource> = new Set(
  DISCOVERY_INJECTION_SOURCES
);
const EMPTY_DATE_SET: ReadonlySet<string> = new Set<string>();

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

// Result of routing one Impact Week week to an SA. `viaFallback` is true when
// the primary SA (Francisco) couldn't take the week and it was handed to the
// fallback SA (Jesus).
export type ImpactWeekSaPick = {
  saPersonId: number;
  viaFallback: boolean;
};

// Decide which SA carries an Impact Week over [start, end]. Prefers
// `primarySaId` (Francisco): if he can absorb the IW's `saPercent` that week,
// he keeps it. Otherwise the week is offloaded to `fallbackSaId` (Jesus) — but
// ONLY when the primary is blocked *specifically by a Week-1 Discovery
// Injection*. "Blocked by an injection" means the primary would fit if his
// injection allocations (discovery_week / w1di) weren't there; if he's over
// capacity for any other reason (stacked Impact Weeks, a SolutionLab, etc.)
// the week stays his and this returns null. Returns null when neither SA fits,
// when there's no fallback SA, or when the primary's block isn't an injection.
export function pickImpactWeekSa(
  primarySaId: number,
  fallbackSaId: number | null,
  start: string,
  end: string,
  allocations: Allocation[],
  saPercent: number
): ImpactWeekSaPick | null {
  const primaryLoad = maxAllocPercentInRange(
    primarySaId,
    start,
    end,
    allocations
  );
  if (primaryLoad + saPercent <= 100) {
    return { saPersonId: primarySaId, viaFallback: false };
  }
  // Primary is over capacity this week. Only offload when the blocker is a
  // Discovery Injection: recompute his load with injection allocations removed
  // — if he'd fit without them, the injection is the cause and Jesus covers it.
  if (fallbackSaId == null) return null;
  const primaryLoadSansInjection = maxAllocPercentInRange(
    primarySaId,
    start,
    end,
    allocations.filter((a) => !INJECTION_SOURCE_SET.has(a.source))
  );
  if (primaryLoadSansInjection + saPercent > 100) return null;
  const fallbackLoad = maxAllocPercentInRange(
    fallbackSaId,
    start,
    end,
    allocations
  );
  if (fallbackLoad + saPercent <= 100) {
    return { saPersonId: fallbackSaId, viaFallback: true };
  }
  return null;
}

// Like findAvailableStarts, but two-SA aware: walk forward from `fromIso` and
// return up to `count` Impact Week starts, each tagged with the SA who would
// carry it. Prefers the primary SA (Francisco); when he's blocked for a week
// specifically by a Discovery Injection, the start is offered with the
// fallback SA (Jesus) — see pickImpactWeekSa. `otherAssignees` (e.g. Guido at
// 15%) are capacity-checked for every candidate regardless of which SA lands
// it. PTO and same-day-kickoff rules apply to whichever SA ends up carrying
// the week (via `kickoffDatesBySa`, keyed by SA id — each SA has their own
// kickoff calendar). A primary blocked by his own PTO or a same-day kickoff —
// rather than by capacity — does NOT trigger the fallback; that date is simply
// skipped, matching the single-SA behaviour.
export function findImpactWeekStartsWithSa(
  primarySaId: number,
  fallbackSaId: number | null,
  saPercent: number,
  otherAssignees: AssigneeBooking[],
  projectLengthWeekdays: number,
  fromIso: string,
  allocations: Allocation[],
  count: number,
  options?: {
    maxDaysOut?: number;
    pto?: PtoDay[];
    kickoffDatesBySa?: Readonly<Record<number, ReadonlySet<string>>>;
  }
): Array<{ start: string; saPersonId: number; viaFallback: boolean }> {
  const maxDaysOut = options?.maxDaysOut ?? 365;
  const pto = options?.pto ?? [];
  const kickoffDatesBySa = options?.kickoffDatesBySa ?? {};
  const out: Array<{
    start: string;
    saPersonId: number;
    viaFallback: boolean;
  }> = [];
  let day = nextWeekday(fromIso);
  for (let i = 0; i < maxDaysOut && out.length < count; i++) {
    const end = addWeekdays(day, projectLengthWeekdays - 1);
    // Guido (and any other fixed assignees) must fit regardless of the SA.
    if (rangeHasCapacity(otherAssignees, day, end, allocations)) {
      const pick = pickImpactWeekSa(
        primarySaId,
        fallbackSaId,
        day,
        end,
        allocations,
        saPercent
      );
      if (pick) {
        const onKickoff = (
          kickoffDatesBySa[pick.saPersonId] ?? EMPTY_DATE_SET
        ).has(day);
        if (!onKickoff && !ptoBlocksKickoff(pick.saPersonId, day, pto)) {
          out.push({
            start: day,
            saPersonId: pick.saPersonId,
            viaFallback: pick.viaFallback,
          });
        }
      }
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
