// Minimal shapes decoupled from any DB driver — both resource-tracker
// (better-sqlite3) and designli-sales (no DB, just an HTTP client) can satisfy
// these.

export type AllocationSource =
  | "runn"
  | "impact_week"
  | "w1di"
  | "discovery_week"
  | "solution_lab";

export type Allocation = {
  id: number;
  person_id: number;
  project_id: number;
  start_date: string; // ISO YYYY-MM-DD
  end_date: string; // ISO YYYY-MM-DD
  percent: number; // 0..100
  source: AllocationSource;
};

export type Person = {
  id: number;
  name: string;
  role_name?: string | null;
};

// A planned booking row: who would carry it and at what percent. The
// capacity checkers walk an array of these and verify none would breach
// their ceiling (maxPercent, default 100) on any day of the candidate
// window.
export type AssigneeBooking = {
  personId: number;
  percent: number;
  // Booking ceiling for this person. Defaults to 100. The Tech Advisor
  // (Guido) is allowed to stack to TECH_ADVISOR_MAX_PERCENT — consumer UIs
  // keep rendering >100% days in red, but bookings aren't blocked until
  // the ceiling is hit.
  maxPercent?: number;
};

// A PTO range for one person, inclusive on both ends. Structurally minimal
// so resource-tracker's richer row (id, note) satisfies it as-is.
export type PtoDay = {
  person_id: number;
  start_date: string; // ISO YYYY-MM-DD
  end_date: string; // ISO YYYY-MM-DD
};
