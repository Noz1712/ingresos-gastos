import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EMPTY, firstValueFrom, map, Observable, switchMap } from 'rxjs';
import { formatMoney } from '../models/currency.model';
import { DEFAULT_EXPENSE_CATEGORIES, Expense, ExpenseCategory } from '../models/expense.model';
import { MoneyPipe } from '../pipes/money.pipe';
import { AuthService } from '../services/auth.service';
import { CategoryService } from '../services/category.service';
import { ExpenseService } from '../services/expense.service';
import { UserPreferencesService } from '../services/user-preferences.service';

@Component({
  selector: 'app-expenses-page',
  imports: [AsyncPipe, DatePipe, ReactiveFormsModule, MoneyPipe],
  templateUrl: './expenses-page.component.html',
  styleUrl: './expenses-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensesPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly expenseService = inject(ExpenseService);
  private readonly categoryService = inject(CategoryService);
  protected readonly preferencesService = inject(UserPreferencesService);

  protected readonly fallbackCategories = DEFAULT_EXPENSE_CATEGORIES;
  protected readonly saving = signal(false);
  protected readonly removingId = signal('');
  protected readonly errorMessage = signal('');

  protected readonly expenseForm = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.minLength(3)]],
    icon: ['🧾', [Validators.required, Validators.maxLength(4)]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    category: [DEFAULT_EXPENSE_CATEGORIES[0] as ExpenseCategory, [Validators.required]],
    spentAt: [new Date().toISOString().slice(0, 10), [Validators.required]],
  });

  protected readonly user$ = this.authService.user$;
  protected readonly expenses$ = this.user$.pipe(
    switchMap((user): Observable<Expense[]> => {
      if (!user) {
        return EMPTY;
      }

      return this.expenseService.expensesForUser(user.uid);
    }),
  );
  protected readonly categories$ = this.user$.pipe(
    switchMap((user) => {
      if (!user) {
        return EMPTY;
      }

      return this.categoryService.categoriesForUser(user.uid, 'expenseCategories').pipe(
        map((categories) =>
          categories.length ? categories.map((category) => category.name) : DEFAULT_EXPENSE_CATEGORIES,
        ),
      );
    }),
  );

  protected readonly totalLabel = computed(() => {
    const amount = this.expenseForm.controls.amount.value;
    return formatMoney(Number(amount || 0), this.preferencesService.currencyCode());
  });

  protected async addExpense(): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user || this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    try {
      await this.expenseService.addExpense(user.uid, this.expenseForm.getRawValue());
      this.expenseForm.patchValue({
        description: '',
        icon: '🧾',
        amount: 0,
        category: DEFAULT_EXPENSE_CATEGORIES[0],
        spentAt: new Date().toISOString().slice(0, 10),
      });
    } catch {
      this.errorMessage.set('No fue posible guardar el gasto.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async removeExpense(expenseId: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) {
      return;
    }

    this.removingId.set(expenseId);
    this.errorMessage.set('');

    try {
      await this.expenseService.deleteExpense(user.uid, expenseId);
    } catch {
      this.errorMessage.set('No fue posible eliminar el gasto.');
    } finally {
      this.removingId.set('');
    }
  }

  private getCurrentUser(): Promise<{ uid: string } | null> {
    return firstValueFrom(this.user$).then((user) => (user ? { uid: user.uid } : null));
  }
}
