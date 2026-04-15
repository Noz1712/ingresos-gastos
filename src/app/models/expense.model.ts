export type ExpenseCategory =
  | 'Alimentacion'
  | 'Transporte'
  | 'Hogar'
  | 'Salud'
  | 'Entretenimiento'
  | 'Otros';

export interface Expense {
  id: string;
  userId: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  spentAt: string;
  createdAt: string;
}

export interface ExpenseInput {
  description: string;
  amount: number;
  category: ExpenseCategory;
  spentAt: string;
}
