/**
 * Indian financial year runs 1 April – 31 March.
 * Invoice series reset at the FY boundary, so every date-to-series mapping
 * in the billing engine goes through here.
 */

export interface FiscalYear {
  /** e.g. "26-27" */
  label: string;
  startYear: number;
  endYear: number;
  start: Date;
  end: Date;
}

export function fiscalYearFor(date: Date = new Date()): FiscalYear {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed; March = 2
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;

  return {
    label: `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`,
    startYear,
    endYear,
    start: new Date(startYear, 3, 1, 0, 0, 0, 0),
    end: new Date(endYear, 2, 31, 23, 59, 59, 999),
  };
}

export function fiscalYearLabel(date: Date = new Date()): string {
  return fiscalYearFor(date).label;
}

/** The last N financial years, newest first — for report filters. */
export function recentFiscalYears(count = 3, from: Date = new Date()): FiscalYear[] {
  const current = fiscalYearFor(from);
  return Array.from({ length: count }, (_, i) =>
    fiscalYearFor(new Date(current.startYear - i, 5, 1))
  );
}
