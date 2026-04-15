export type IncomeCategory = string;

export const DEFAULT_INCOME_CATEGORIES: IncomeCategory[] = [
  'Salario',
  'Freelance',
  'Ventas',
  'Inversiones',
  'Regalos',
  'Otros',
];

export interface Income {
  id: string;
  userId: string;
  description: string;
  icon: string;
  amount: number;
  category: IncomeCategory;
  receivedAt: string;
  createdAt: string;
}

export interface IncomeInput {
  description: string;
  icon: string;
  amount: number;
  category: IncomeCategory;
  receivedAt: string;
}
