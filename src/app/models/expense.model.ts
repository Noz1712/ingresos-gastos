export type ExpenseCategory = string;

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Alimentacion',
  'Transporte',
  'Hogar',
  'Salud',
  'Entretenimiento',
  'Otros',
];

export interface Expense {
  id: string;
  userId: string;
  description: string;
  icon: string;
  amount: number;
  category: ExpenseCategory;
  spentAt: string;
  createdAt: string;
}

export interface ExpenseInput {
  description: string;
  icon: string;
  amount: number;
  category: ExpenseCategory;
  spentAt: string;
}
