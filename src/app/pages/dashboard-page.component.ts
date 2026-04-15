import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, EMPTY, map, Observable, switchMap } from 'rxjs';
import { Expense } from '../models/expense.model';
import { Income } from '../models/income.model';
import { CURRENCY_CATALOG } from '../models/currency.model';
import { MoneyPipe } from '../pipes/money.pipe';
import { AuthService } from '../services/auth.service';
import { ExpenseService } from '../services/expense.service';
import { IncomeService } from '../services/income.service';
import { UserPreferencesService } from '../services/user-preferences.service';

type DateFilter = 'today' | 'week' | 'month' | 'last30' | 'all';

interface DashboardSummary {
  incomes: Income[];
  expenses: Expense[];
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
  movementCount: number;
}

type DashboardMovement =
  | { kind: 'income'; date: string; amount: number; title: string; category: string; icon: string; id: string }
  | { kind: 'expense'; date: string; amount: number; title: string; category: string; icon: string; id: string };

@Component({
  selector: 'app-dashboard-page',
  imports: [AsyncPipe, DatePipe, DecimalPipe, MoneyPipe],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {
  private readonly authService = inject(AuthService);
  private readonly incomeService = inject(IncomeService);
  private readonly expenseService = inject(ExpenseService);
  protected readonly preferencesService = inject(UserPreferencesService);

  protected readonly activeFilter = signal<DateFilter>('month');
  protected readonly selectedCurrencyCode = signal(this.preferencesService.currencyCode());
  protected readonly currencyCatalog = CURRENCY_CATALOG;
  protected readonly filters: Array<{ key: DateFilter; label: string }> = [
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: 'Esta semana' },
    { key: 'month', label: 'Este mes' },
    { key: 'last30', label: 'Ultimos 30 dias' },
    { key: 'all', label: 'Todo' },
  ];

  protected readonly summary$ = this.authService.user$.pipe(
    switchMap((user): Observable<DashboardSummary> => {
      if (!user) {
        return EMPTY;
      }

      return combineLatest([
        toObservable(this.activeFilter),
        this.incomeService.incomesForUser(user.uid),
        this.expenseService.expensesForUser(user.uid),
      ]).pipe(
        map(([filter, incomes, expenses]) => {
          const { start, end } = this.getRange(filter);
          const filteredIncomes = incomes.filter((item) => this.inRange(item.receivedAt, start, end));
          const filteredExpenses = expenses.filter((item) => this.inRange(item.spentAt, start, end));
          const incomeTotal = filteredIncomes.reduce((sum, item) => sum + item.amount, 0);
          const expenseTotal = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);

          return {
            incomes: filteredIncomes,
            expenses: filteredExpenses,
            incomeTotal,
            expenseTotal,
            balance: incomeTotal - expenseTotal,
            movementCount: filteredIncomes.length + filteredExpenses.length,
          };
        }),
      );
    }),
  );

  protected readonly filterLabel = computed(
    () => this.filters.find((filter) => filter.key === this.activeFilter())?.label ?? 'Este mes',
  );

  constructor() {
    effect(() => {
      this.selectedCurrencyCode.set(this.preferencesService.currencyCode());
    });
  }

  protected setFilter(filter: DateFilter): void {
    this.activeFilter.set(filter);
  }

  protected async saveCurrency(): Promise<void> {
    await this.preferencesService.saveCurrency(this.selectedCurrencyCode());
  }

  protected movements(summary: DashboardSummary): DashboardMovement[] {
    return [
      ...summary.incomes.map((item) => ({
        kind: 'income' as const,
        id: item.id,
        date: item.receivedAt,
        amount: item.amount,
        title: item.description,
        category: item.category,
        icon: item.icon,
      })),
      ...summary.expenses.map((item) => ({
        kind: 'expense' as const,
        id: item.id,
        date: item.spentAt,
        amount: item.amount,
        title: item.description,
        category: item.category,
        icon: item.icon,
      })),
    ].sort((left, right) => right.date.localeCompare(left.date));
  }

  private getRange(filter: DateFilter): { start: Date | null; end: Date | null } {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    if (filter === 'today') {
      return { start: todayStart, end: todayEnd };
    }

    if (filter === 'week') {
      const day = todayStart.getDay();
      const offset = day === 0 ? 6 : day - 1;
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - offset);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      return { start: weekStart, end: weekEnd };
    }

    if (filter === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start: monthStart, end: monthEnd };
    }

    if (filter === 'last30') {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 29);
      return { start, end: todayEnd };
    }

    return { start: null, end: null };
  }

  private inRange(value: string, start: Date | null, end: Date | null): boolean {
    if (!start || !end) {
      return true;
    }

    const date = new Date(`${value}T00:00:00`);
    return date >= start && date < end;
  }
}
