import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { EMPTY, firstValueFrom, Observable, switchMap } from 'rxjs';
import { Expense, ExpenseCategory } from '../models/expense.model';
import { AuthService } from '../services/auth.service';
import { ExpenseService } from '../services/expense.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [AsyncPipe, CurrencyPipe, DatePipe, ReactiveFormsModule],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly expenseService = inject(ExpenseService);
  private readonly router = inject(Router);

  protected readonly categories: ExpenseCategory[] = [
    'Alimentacion',
    'Transporte',
    'Hogar',
    'Salud',
    'Entretenimiento',
    'Otros',
  ];
  protected readonly saving = signal(false);
  protected readonly removingId = signal('');
  protected readonly errorMessage = signal('');

  protected readonly expenseForm = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.minLength(3)]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    category: ['Alimentacion' as ExpenseCategory, [Validators.required]],
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

  protected readonly totalLabel = computed(() => {
    const amount = this.expenseForm.controls.amount.value;
    return new Intl.NumberFormat('es-GT', {
      style: 'currency',
      currency: 'GTQ',
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
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
        amount: 0,
        category: 'Alimentacion',
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

  protected async logout(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigateByUrl('/login');
  }

  private getCurrentUser(): Promise<{ uid: string } | null> {
    return firstValueFrom(this.user$).then((user) => (user ? { uid: user.uid } : null));
  }
}
