import type { RecurringSeries } from './types.js';

export interface CashflowSummary {
  /** Total detected recurring outgoings per month, in cents. */
  monthlyBillsCents: number;
  /** Total detected recurring income per month, in cents. */
  monthlyIncomeCents: number;
  /** Income minus bills, in cents — what's left for everything else. */
  monthlySurplusCents: number;
  /** Bills predicted to fall due within `horizonDays` (default 30). */
  upcoming: RecurringSeries[];
  /** Bills whose predicted date has passed — possibly missed or cancelled. */
  overdue: RecurringSeries[];
}

export function summarizeCashflow(
  bills: RecurringSeries[],
  income: RecurringSeries[],
  horizonDays = 30,
): CashflowSummary {
  const monthlyBillsCents = bills.reduce((sum, b) => sum + b.monthlyAmountCents, 0);
  const monthlyIncomeCents = income.reduce((sum, i) => sum + i.monthlyAmountCents, 0);
  return {
    monthlyBillsCents,
    monthlyIncomeCents,
    monthlySurplusCents: monthlyIncomeCents - monthlyBillsCents,
    upcoming: bills
      .filter((b) => b.daysUntilNext >= 0 && b.daysUntilNext <= horizonDays)
      .sort((a, b) => a.daysUntilNext - b.daysUntilNext),
    overdue: bills
      .filter((b) => b.daysUntilNext < 0)
      .sort((a, b) => a.daysUntilNext - b.daysUntilNext),
  };
}
