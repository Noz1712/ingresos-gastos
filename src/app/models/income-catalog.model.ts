import { CatalogScheduleEntry } from './expense-catalog.model';

export type IncomeCatalogType = 'Recurrente' | 'Eventual';
export const INCOME_CATALOG_TYPES: IncomeCatalogType[] = ['Recurrente', 'Eventual'];

export interface IncomeCatalogItem {
  id: string;
  userId: string;
  type: IncomeCatalogType;
  category: string;
  name: string;
  fixedAmount: number;
  color: string;
  icon: string;
  paymentSchedules: CatalogScheduleEntry[];
  endDate: string | null;
  isIndefinite: boolean;
  createdAt: string;
}

export interface IncomeCatalogInput {
  type: IncomeCatalogType;
  category: string;
  name: string;
  fixedAmount: number;
  color: string;
  icon: string;
  paymentSchedules?: CatalogScheduleEntry[];
  endDate?: string | null;
  isIndefinite?: boolean;
}
