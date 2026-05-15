// Minimal shapes decoupled from any DB driver — both resource-tracker
// (better-sqlite3) and designli-sales (no DB, just an HTTP client) can satisfy
// these.

export type AllocationSource =
  | "runn"
  | "impact_week"
  | "w1di"
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
// 100% on any day of the candidate window.
export type AssigneeBooking = {
  personId: number;
  percent: number;
};
