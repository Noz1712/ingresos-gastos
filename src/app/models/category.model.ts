export type CategoryKind = 'incomeCategories' | 'expenseCategories';

export interface UserCategory {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
}

export interface UserCategoryInput {
  name: string;
  color: string;
  icon: string;
}
