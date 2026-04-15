import { AsyncPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { combineLatest, EMPTY, firstValueFrom, map, Observable, switchMap } from 'rxjs';
import { UserCategory } from '../models/category.model';
import { DEFAULT_INCOME_CATEGORIES, Income, IncomeCategory } from '../models/income.model';
import { MoneyPipe } from '../pipes/money.pipe';
import { AuthService } from '../services/auth.service';
import { CategoryService } from '../services/category.service';
import { IncomeService } from '../services/income.service';
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
  selector: 'app-income-categories-page',
  imports: [AsyncPipe, PercentPipe, ReactiveFormsModule, MoneyPipe],
  templateUrl: './income-categories-page.component.html',
  styleUrl: './income-categories-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomeCategoriesPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly incomeService = inject(IncomeService);
  private readonly categoryService = inject(CategoryService);
  protected readonly preferencesService = inject(UserPreferencesService);

  protected readonly saving = signal(false);
  protected readonly removingId = signal('');
  protected readonly errorMessage = signal('');
  protected readonly categoryForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    color: ['#76b4ff', [Validators.required]],
    icon: ['💰', [Validators.required, Validators.maxLength(4)]],
  });

  protected readonly categories$ = this.authService.user$.pipe(
    switchMap((user): Observable<UserCategory[]> => {
      if (!user) {
        return EMPTY;
      }

      return this.categoryService.categoriesForUser(user.uid, 'incomeCategories');
    }),
  );

  protected readonly summaries$ = this.authService.user$.pipe(
    switchMap((user): Observable<CategorySummary<IncomeCategory>[]> => {
      if (!user) {
        return EMPTY;
      }

      return combineLatest([
        this.categoryService.categoriesForUser(user.uid, 'incomeCategories'),
        this.incomeService.incomesForUser(user.uid),
      ]).pipe(map(([categories, incomes]) => this.buildSummary(categories, incomes)));
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
      await this.categoryService.addCategory(user.uid, 'incomeCategories', this.categoryForm.getRawValue());
      this.categoryForm.patchValue({ name: '', color: '#76b4ff', icon: '💰' });
    } catch {
      this.errorMessage.set('No fue posible guardar la categoria.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async addDefaultCategories(): Promise<void> {
    const user = await this.getCurrentUser();
    const existing = await firstValueFrom(this.categories$);
    if (!user) {
      return;
    }

    const existingNames = new Set(existing.map((category) => category.name.toLowerCase()));
    const defaultsToCreate = DEFAULT_INCOME_CATEGORIES.filter(
      (category) => !existingNames.has(category.toLowerCase()),
    );

    for (const category of defaultsToCreate) {
      await this.categoryService.addCategory(user.uid, 'incomeCategories', {
        name: category,
        color: '#76b4ff',
        icon: '💰',
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
      await this.categoryService.deleteCategory(user.uid, 'incomeCategories', categoryId);
    } catch {
      this.errorMessage.set('No fue posible eliminar la categoria.');
    } finally {
      this.removingId.set('');
    }
  }

  private buildSummary(
    categories: UserCategory[],
    incomes: Income[],
  ): CategorySummary<IncomeCategory>[] {
    const total = incomes.reduce((sum, income) => sum + income.amount, 0);
    const grouped = new Map<IncomeCategory, CategorySummary<IncomeCategory>>();

    for (const income of incomes) {
      const current = grouped.get(income.category) ?? {
        category: income.category,
        count: 0,
        total: 0,
        share: 0,
      };

      current.count += 1;
      current.total += income.amount;
      grouped.set(income.category, current);
    }

    const allNames = new Set<IncomeCategory>([
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
          icon: categoryDoc?.icon ?? '💰',
          share: total ? current.total / total : 0,
        };
      })
      .sort((left, right) => right.total - left.total || left.category.localeCompare(right.category));
  }

  private getCurrentUser(): Promise<{ uid: string } | null> {
    return firstValueFrom(this.authService.user$).then((user) => (user ? { uid: user.uid } : null));
  }
}
