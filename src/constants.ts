// Constants shared between resource-tracker and any consumer building
// discovery-booking UI (e.g. designli-sales pitch deck widget).

export const FRANCISCO_SA_NAME = "Francisco Perez";
export const JESUS_SA_NAME = "Jesus Saravia";
export const IMPACT_WEEK_DEV_NAME = "Guido Tapia";

// The two SAs who can staff Discovery work.
export const DISCOVERY_SA_NAMES = [FRANCISCO_SA_NAME, JESUS_SA_NAME] as const;

// Impact Week staffing percentages.
export const IMPACT_WEEK_SA_PERCENT = 25;
export const IMPACT_WEEK_TA_PERCENT = 25;
export const IMPACT_WEEK_DESIGNER_PERCENT = 25;
export const IMPACT_WEEK_LENGTH_WEEKDAYS = 5;
export const IMPACT_WEEK_MAX_PARALLEL = 4;

// SolutionLab staffing percentages.
export const SOLUTION_LAB_DEFAULT_SA_NAME = JESUS_SA_NAME;
export const SOLUTION_LAB_DEFAULT_TA_NAME = IMPACT_WEEK_DEV_NAME;
export const SOLUTION_LAB_DESIGNER_PERCENT = 100;
export const SOLUTION_LAB_SA_PERCENT = 50;
export const SOLUTION_LAB_TA_PERCENT = 25;
export const SOLUTION_LAB_LENGTH_WEEKDAYS = 10;
