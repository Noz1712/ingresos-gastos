export type ExpenseCatalogType = 'Recurrente' | 'Deuda' | 'Eventual';
export const EXPENSE_CATALOG_CATEGORIES: ExpenseCatalogType[] = ['Recurrente', 'Deuda', 'Eventual'];
export type DebtPaymentMode = 'Recurrente' | 'PagoUnico';

export interface CatalogScheduleEntry {
  day: number;
  amount: number;
}

export interface ExpenseCatalogItem {
  id: string;
  userId: string;
  type: ExpenseCatalogType;
  category: string;
  name: string;
  color: string;
  icon: string;
  initialDebt: number | null;
  debtPaymentMode?: DebtPaymentMode | null;
  paymentSchedules: CatalogScheduleEntry[];
  endDate: string | null;
  isIndefinite: boolean;
  createdAt: string;
}

export interface ExpenseCatalogInput {
  type: ExpenseCatalogType;
  category: string;
  name: string;
  color: string;
  icon: string;
  initialDebt?: number | null;
  debtPaymentMode?: DebtPaymentMode | null;
  paymentSchedules?: CatalogScheduleEntry[];
  endDate?: string | null;
  isIndefinite?: boolean;
}
