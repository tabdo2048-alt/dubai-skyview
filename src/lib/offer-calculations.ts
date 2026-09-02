import type {
  ProjectFeeRow,
  ProjectPaymentPlanInstallmentRow,
  ProjectPaymentPlanWithInstallments,
} from "@/lib/types";

export type OfferInstallment = Pick<
  ProjectPaymentPlanInstallmentRow,
  "id" | "label" | "stage" | "percentage" | "due_type" | "due_label" | "months" | "sort_order"
>;

export type OfferFee = Pick<ProjectFeeRow, "id" | "label" | "fee_type" | "value" | "sort_order">;

export type CalculatedInstallment = OfferInstallment & {
  amount: number;
  monthlyAmount: number | null;
};

export type PaymentPlanValidation = {
  valid: boolean;
  total: number;
  difference: number;
};

export type FinancialSummary = {
  unitPrice: number;
  feeRows: Array<OfferFee & { amount: number }>;
  totalFees: number;
  totalInvestment: number;
};

export type OfferCalculation = {
  unitPrice: number;
  planId: string;
  installments: CalculatedInstallment[];
  totalPercentage: number;
  totalInstallmentAmount: number;
  monthlyInstallments: CalculatedInstallment[];
  stageTotals: Array<{ stage: string; percentage: number; amount: number }>;
  validation: PaymentPlanValidation;
  financialSummary: FinancialSummary;
};

const EPSILON = 0.0001;

export function calculateInstallmentAmount(unitPrice: number, percentage: number): number {
  return unitPrice * (percentage / 100);
}

export function calculateMonthlyPayment(amount: number, months: number | null | undefined): number | null {
  if (months == null || !Number.isFinite(months) || months <= 0) return null;
  return amount / months;
}

export function validatePaymentPlanTotal(
  installments: Array<Pick<OfferInstallment, "percentage">>,
): PaymentPlanValidation {
  const total = installments.reduce((sum, installment) => sum + (Number(installment.percentage) || 0), 0);
  return {
    valid: Math.abs(total - 100) <= EPSILON,
    total,
    difference: 100 - total,
  };
}

export function calculateFinancialSummary(unitPrice: number, fees: OfferFee[] = []): FinancialSummary {
  const feeRows = [...fees]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .filter((fee) => fee.label.trim() && Number.isFinite(Number(fee.value)) && Number(fee.value) >= 0)
    .map((fee) => ({
      ...fee,
      amount: fee.fee_type === "percentage" ? unitPrice * (Number(fee.value) / 100) : Number(fee.value),
    }));
  const totalFees = feeRows.reduce((sum, fee) => sum + fee.amount, 0);
  return { unitPrice, feeRows, totalFees, totalInvestment: unitPrice + totalFees };
}

export function calculatePaymentPlan(
  unitPrice: number,
  plan: Pick<ProjectPaymentPlanWithInstallments, "id" | "installments">,
  fees: OfferFee[] = [],
): OfferCalculation {
  const source = [...(plan.installments ?? [])].sort((a, b) => {
    const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    return order || a.id.localeCompare(b.id);
  });
  const installments = source.map((installment) => ({
    ...installment,
    percentage: Number(installment.percentage),
    amount: calculateInstallmentAmount(unitPrice, Number(installment.percentage)),
    monthlyAmount: calculateMonthlyPayment(
      calculateInstallmentAmount(unitPrice, Number(installment.percentage)),
      installment.months,
    ),
  }));
  const validation = validatePaymentPlanTotal(installments);
  const stageMap = new Map<string, { percentage: number; amount: number }>();
  for (const installment of installments) {
    const stage = installment.stage?.trim();
    if (!stage) continue;
    const current = stageMap.get(stage) ?? { percentage: 0, amount: 0 };
    current.percentage += installment.percentage;
    current.amount += installment.amount;
    stageMap.set(stage, current);
  }
  return {
    unitPrice,
    planId: plan.id,
    installments,
    totalPercentage: validation.total,
    totalInstallmentAmount: installments.reduce((sum, installment) => sum + installment.amount, 0),
    monthlyInstallments: installments.filter((installment) => installment.monthlyAmount != null),
    stageTotals: [...stageMap.entries()].map(([stage, totals]) => ({ stage, ...totals })),
    validation,
    financialSummary: calculateFinancialSummary(unitPrice, fees),
  };
}

export function formatCurrency(value: number | null | undefined, currency = "AED"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercentage(value: number): string {
  return `${new Intl.NumberFormat("en-AE", { maximumFractionDigits: 2 }).format(value)}%`;
}
