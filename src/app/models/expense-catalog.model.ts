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

export const DEFAULT_EXPENSE_CATALOG: ExpenseCatalogInput[] = [
  {
    type: 'Recurrente',
    category: 'Hogar',
    name: 'Renta',
    color: '#76b4ff',
    icon: '🏠',
    paymentSchedules: [{ day: 1, amount: 250 }],
    isIndefinite: true,
  },
  {
    type: 'Recurrente',
    category: 'Servicios',
    name: 'Internet',
    color: '#76b4ff',
    icon: '🌐',
    paymentSchedules: [{ day: 10, amount: 40 }],
    isIndefinite: true,
  },
  {
    type: 'Deuda',
    category: 'Finanzas',
    name: 'Tarjeta de credito',
    color: '#76b4ff',
    icon: '💳',
    initialDebt: 1000,
    paymentSchedules: [{ day: 15, amount: 120 }],
    endDate: new Date(new Date().getFullYear() + 1, 11, 31).toISOString().slice(0, 10),
    isIndefinite: false,
  },
  {
    type: 'Eventual',
    category: 'Salud',
    name: 'Farmacia',
    color: '#76b4ff',
    icon: '💊',
    isIndefinite: true,
  },
];
