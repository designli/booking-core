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
// `primarySaId` (Francisco): if he can absorb the IW's `saPercent` that week
// and he's free on the kickoff day, he keeps it. Otherwise the week is
// offloaded to `fallbackSaId` (Jesus) — but only for the two blockers that are
// genuinely "Francisco can't be here for this one":
//
//   1. A Week-1 Discovery Injection eating his capacity. "Blocked by an
//      injection" means he'd fit if his injection allocations (discovery_week
//      / w1di) weren't there; over capacity for any other reason (stacked
//      Impact Weeks, a SolutionLab) keeps the week his.
//   2. PTO on the kickoff day — he's out of the office and can't run day 1.
//      Pass `options.pto` to enable this; PTO on days 2-5 is fair game and
//      never reroutes (see KICKOFF_PTO_BLACKOUT_WEEKDAYS).
//
// The fallback only takes the week if he can actually run it: capacity for the
// full week AND no PTO of his own on the kickoff day. Returns null when nobody
// can take it, when there's no fallback SA, or when the primary's block is one
// this doesn't reroute.
export function pickImpactWeekSa(
  primarySaId: number,
  fallbackSaId: number | null,
  start: string,
  end: string,
  allocations: Allocation[],
  saPercent: number,
  options?: { pto?: PtoDay[] }
): ImpactWeekSaPick | null {
  const pto = options?.pto ?? [];
  const primaryLoad = maxAllocPercentInRange(
    primarySaId,
    start,
    end,
    allocations
  );
  const primaryHasCapacity = primaryLoad + saPercent <= 100;
  const primaryOnKickoffPto = ptoBlocksKickoff(primarySaId, start, pto);
  if (primaryHasCapacity && !primaryOnKickoffPto) {
    return { saPersonId: primarySaId, viaFallback: false };
  }
  if (fallbackSaId == null) return null;
  // Primary can't take the week. If capacity is what's stopping him, only
  // offload when a Discovery Injection is the cause: recompute his load with
  // injection allocations removed — if he'd fit without them, Jesus covers it.
  if (!primaryHasCapacity) {
    const primaryLoadSansInjection = maxAllocPercentInRange(
      primarySaId,
      start,
      end,
      allocations.filter((a) => !INJECTION_SOURCE_SET.has(a.source))
    );
    if (primaryLoadSansInjection + saPercent > 100) return null;
  }
  const fallbackLoad = maxAllocPercentInRange(
    fallbackSaId,
    start,
    end,
    allocations
  );
  if (fallbackLoad + saPercent > 100) return null;
  if (ptoBlocksKickoff(fallbackSaId, start, pto)) return null;
  return { saPersonId: fallbackSaId, viaFallback: true };
}

// Like findAvailableStarts, but two-SA aware: walk forward from `fromIso` and
// return up to `count` Impact Week starts, each tagged with the SA who would
// carry it. Prefers the primary SA (Francisco); when he's blocked for a week
// either by a Discovery Injection or by PTO on that kickoff day, the start is
// offered with the fallback SA (Jesus) instead of disappearing — see
// pickImpactWeekSa. `otherAssignees` (e.g. Guido at 15%) are capacity-checked
// for every candidate regardless of which SA lands it. The same-day-kickoff
// rule applies to whichever SA ends up carrying the week (via
// `kickoffDatesBySa`, keyed by SA id — each SA has their own kickoff
// calendar); a primary already kicking something off that day does NOT trigger
// the fallback, that date is simply skipped.
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
      // pickImpactWeekSa owns the kickoff-PTO rule (it's what decides whether
      // PTO reroutes to the fallback or kills the date), so the SA it hands
      // back is already PTO-clear for `day`.
      const pick = pickImpactWeekSa(
        primarySaId,
        fallbackSaId,
        day,
        end,
        allocations,
        saPercent,
        { pto }
      );
      if (pick) {
        const onKickoff = (
          kickoffDatesBySa[pick.saPersonId] ?? EMPTY_DATE_SET
        ).has(day);
        if (!onKickoff) {
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
