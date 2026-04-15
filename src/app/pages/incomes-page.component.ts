import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EMPTY, firstValueFrom, map, Observable, switchMap } from 'rxjs';
import { formatMoney } from '../models/currency.model';
import { DEFAULT_INCOME_CATEGORIES, Income, IncomeCategory } from '../models/income.model';
import { MoneyPipe } from '../pipes/money.pipe';
import { AuthService } from '../services/auth.service';
import { CategoryService } from '../services/category.service';
import { IncomeService } from '../services/income.service';
import { UserPreferencesService } from '../services/user-preferences.service';

@Component({
  selector: 'app-incomes-page',
  imports: [AsyncPipe, DatePipe, ReactiveFormsModule, MoneyPipe],
  templateUrl: './incomes-page.component.html',
  styleUrl: './incomes-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomesPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly incomeService = inject(IncomeService);
  private readonly categoryService = inject(CategoryService);
  protected readonly preferencesService = inject(UserPreferencesService);

  protected readonly fallbackCategories = DEFAULT_INCOME_CATEGORIES;
  protected readonly saving = signal(false);
  protected readonly removingId = signal('');
  protected readonly errorMessage = signal('');

  protected readonly incomeForm = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.minLength(3)]],
    icon: ['💼', [Validators.required, Validators.maxLength(4)]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    category: [DEFAULT_INCOME_CATEGORIES[0] as IncomeCategory, [Validators.required]],
    receivedAt: [new Date().toISOString().slice(0, 10), [Validators.required]],
  });

  protected readonly user$ = this.authService.user$;
  protected readonly incomes$ = this.user$.pipe(
    switchMap((user): Observable<Income[]> => {
      if (!user) {
        return EMPTY;
      }

      return this.incomeService.incomesForUser(user.uid);
    }),
  );
  protected readonly categories$ = this.user$.pipe(
    switchMap((user) => {
      if (!user) {
        return EMPTY;
      }

      return this.categoryService.categoriesForUser(user.uid, 'incomeCategories').pipe(
        map((categories) =>
          categories.length ? categories.map((category) => category.name) : DEFAULT_INCOME_CATEGORIES,
        ),
      );
    }),
  );

  protected readonly totalLabel = computed(() => {
    const amount = this.incomeForm.controls.amount.value;
    return formatMoney(Number(amount || 0), this.preferencesService.currencyCode());
  });

  protected async addIncome(): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user || this.incomeForm.invalid) {
      this.incomeForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    try {
      await this.incomeService.addIncome(user.uid, this.incomeForm.getRawValue());
      this.incomeForm.patchValue({
        description: '',
        icon: '💼',
        amount: 0,
        category: DEFAULT_INCOME_CATEGORIES[0],
        receivedAt: new Date().toISOString().slice(0, 10),
      });
    } catch {
      this.errorMessage.set('No fue posible guardar el ingreso.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async removeIncome(incomeId: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) {
      return;
    }

    this.removingId.set(incomeId);
    this.errorMessage.set('');

    try {
      await this.incomeService.deleteIncome(user.uid, incomeId);
    } catch {
      this.errorMessage.set('No fue posible eliminar el ingreso.');
    } finally {
      this.removingId.set('');
    }
  }

  private getCurrentUser(): Promise<{ uid: string } | null> {
    return firstValueFrom(this.user$).then((user) => (user ? { uid: user.uid } : null));
  }
}
