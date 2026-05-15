# @designli/booking-core

Shared TypeScript logic for Designli's discovery-booking widgets. Pure
calendar arithmetic, capacity rules, and start-date suggestion logic — no
runtime dependencies beyond TypeScript itself.

## Consumers

- **`resource-tracker-simple`** — re-exports from `lib/discovery.ts` so all
  existing call sites keep working.
- **`designli-sales`** — slide-14 Impact Week booking widget on the pitch
  deck.

## Install

Pinned to a git tag (preferred for stability) or the `main` branch:

```jsonc
"dependencies": {
  "@designli/booking-core": "git+https://github.com/designli/booking-core.git#main"
}
```

## API surface

- `findAvailableStarts(assignees, projectLengthWeekdays, fromIso, allocations, count, options?)`
  — returns up to `count` start dates where every assignee fits within
  100% utilization across the project window. Excludes weekends and
  optionally excludes a set of pre-existing kickoff dates.
- `rangeHasCapacity(assignees, start, end, allocations)` — gate for the
  manual date picker.
- `maxAllocPercentInRange(personId, start, end, allocations)` — the
  underlying per-day utilization calculation.
- `discoveryKickoffDates(allocations)` — derives the
  already-kicked-off-on-this-day exclusion set from an allocations list.
- Date helpers: `addDays`, `addWeekdays`, `nextWeekday`,
  `impactWeekRange`, `solutionLabRange`.
- Constants: `IMPACT_WEEK_SA_PERCENT`, `IMPACT_WEEK_LENGTH_WEEKDAYS`,
  `SOLUTION_LAB_*`, etc.

## Updates

Push to `main`, then in each consumer:

```bash
npm update @designli/booking-core
```

No publish workflow.
