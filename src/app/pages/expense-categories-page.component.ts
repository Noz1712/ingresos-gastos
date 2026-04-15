import { AsyncPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { combineLatest, EMPTY, firstValueFrom, map, Observable, switchMap } from 'rxjs';
import { CATEGORY_ICON_PRESETS } from '../models/category-icon-presets.model';
import { UserCategory } from '../models/category.model';
import { DEFAULT_EXPENSE_CATEGORIES, Expense, ExpenseCategory } from '../models/expense.model';
import { MoneyPipe } from '../pipes/money.pipe';
import { AuthService } from '../services/auth.service';
import { CategoryService } from '../services/category.service';
import { ExpenseService } from '../services/expense.service';
import { UserPreferencesService } from '../services/user-preferences.service';

interface CategorySummary<TCategory extends string> {
  category: TCategory;
  count: number;
  total: number;
  share: number;
  id?: string;
  color?: string;
  icon?: string;
}

@Component({
  selector: 'app-expense-categories-page',
  imports: [AsyncPipe, PercentPipe, ReactiveFormsModule, MoneyPipe],
  templateUrl: './expense-categories-page.component.html',
  styleUrl: './expense-categories-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseCategoriesPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly expenseService = inject(ExpenseService);
  private readonly categoryService = inject(CategoryService);
  protected readonly preferencesService = inject(UserPreferencesService);

  protected readonly saving = signal(false);
  protected readonly removingId = signal('');
  protected readonly editingId = signal('');
  protected readonly errorMessage = signal('');
  protected readonly iconPresets = CATEGORY_ICON_PRESETS;
  protected readonly categoryForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    icon: ['🛒', [Validators.required, Validators.maxLength(4)]],
  });

  protected readonly categories$ = this.authService.user$.pipe(
    switchMap((user): Observable<UserCategory[]> => {
      if (!user) {
        return EMPTY;
      }

      return this.categoryService.categoriesForUser(user.uid, 'expenseCategories');
    }),
  );

  protected readonly summaries$ = this.authService.user$.pipe(
    switchMap((user): Observable<CategorySummary<ExpenseCategory>[]> => {
      if (!user) {
        return EMPTY;
      }

      return combineLatest([
        this.categoryService.categoriesForUser(user.uid, 'expenseCategories'),
        this.expenseService.expensesForUser(user.uid),
      ]).pipe(map(([categories, expenses]) => this.buildSummary(categories, expenses)));
    }),
  );

  protected async addCategory(): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user || this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    try {
      if (this.editingId()) {
        await this.categoryService.updateCategory(
          user.uid,
          'expenseCategories',
          this.editingId(),
          this.categoryForm.getRawValue(),
        );
      } else {
        await this.categoryService.addCategory(user.uid, 'expenseCategories', this.categoryForm.getRawValue());
      }

      this.resetForm();
    } catch {
      this.errorMessage.set('No fue posible guardar la categoria.');
    } finally {
      this.saving.set(false);
    }
  }

  protected startEdit(category: UserCategory): void {
    this.editingId.set(category.id);
    this.errorMessage.set('');
    this.categoryForm.patchValue({
      name: category.name,
      icon: category.icon,
    });
  }

  protected cancelEdit(): void {
    this.resetForm();
  }

  protected selectIcon(icon: string): void {
    this.categoryForm.patchValue({ icon });
  }

  protected isEditing(categoryId: string): boolean {
    return this.editingId() === categoryId;
  }

  protected async addDefaultCategories(): Promise<void> {
    const user = await this.getCurrentUser();
    const existing = await firstValueFrom(this.categories$);
    if (!user) {
      return;
    }

    const existingNames = new Set(existing.map((category) => category.name.toLowerCase()));
    const defaultsToCreate = DEFAULT_EXPENSE_CATEGORIES.filter(
      (category) => !existingNames.has(category.toLowerCase()),
    );

    for (const category of defaultsToCreate) {
      await this.categoryService.addCategory(user.uid, 'expenseCategories', {
        name: category,
        icon: '🛒',
      });
    }
  }

  protected async removeCategory(categoryId: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) {
      return;
    }

    this.removingId.set(categoryId);
    this.errorMessage.set('');

    try {
      await this.categoryService.deleteCategory(user.uid, 'expenseCategories', categoryId);
    } catch {
      this.errorMessage.set('No fue posible eliminar la categoria.');
    } finally {
      this.removingId.set('');
      if (this.isEditing(categoryId)) {
        this.resetForm();
      }
    }
  }

  private resetForm(): void {
    this.editingId.set('');
    this.categoryForm.patchValue({ name: '', icon: '🛒' });
  }

  private buildSummary(
    categories: UserCategory[],
    expenses: Expense[],
  ): CategorySummary<ExpenseCategory>[] {
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const grouped = new Map<ExpenseCategory, CategorySummary<ExpenseCategory>>();

    for (const expense of expenses) {
      const current = grouped.get(expense.category) ?? {
        category: expense.category,
        count: 0,
        total: 0,
        share: 0,
      };

      current.count += 1;
      current.total += expense.amount;
      grouped.set(expense.category, current);
    }

    const allNames = new Set<ExpenseCategory>([
      ...categories.map((category) => category.name),
      ...grouped.keys(),
    ]);

    return Array.from(allNames)
      .map((name) => {
        const current = grouped.get(name) ?? { category: name, count: 0, total: 0, share: 0 };
        const categoryDoc = categories.find((category) => category.name === name);
        return {
          ...current,
          id: categoryDoc?.id,
          color: categoryDoc?.color ?? '#76b4ff',
          icon: categoryDoc?.icon ?? '🛒',
          share: total ? current.total / total : 0,
        };
      })
      .sort((left, right) => right.total - left.total || left.category.localeCompare(right.category));
  }

  private getCurrentUser(): Promise<{ uid: string } | null> {
    return firstValueFrom(this.authService.user$).then((user) => (user ? { uid: user.uid } : null));
  }
}
