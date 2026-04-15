import { ExpenseCatalogType } from './expense-catalog.model';

export interface PendingPaymentSchedule {
  day: number;
  amount: number;
}

export interface PendingExpense {
  id: string;
  userId: string;
  catalogItemId: string;
  name: string;
  icon: string;
  category: string;
  type: ExpenseCatalogType;
  paymentSchedules: PendingPaymentSchedule[];
  amount: number;
  dueDays: number[];
  completedDueDates: string[];
  active: boolean;
  createdAt: string;
}

export interface PendingExpenseInput {
  catalogItemId: string;
  name: string;
  icon: string;
  category: string;
  type: ExpenseCatalogType;
  paymentSchedules: PendingPaymentSchedule[];
  amount: number;
  dueDays: number[];
  active: boolean;
}
