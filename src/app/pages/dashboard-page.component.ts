import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { EMPTY, map, Observable, switchMap } from 'rxjs';
import { DateInputComponent } from '../components/date-input.component';
import { MoneyPipe } from '../pipes/money.pipe';
import { AuthService } from '../services/auth.service';
import { ExpenseService } from '../services/expense.service';
import { UserPreferencesService } from '../services/user-preferences.service';
import { parseIsoDateAsLocalDate, toIsoDateKey } from '../utils/date-utils';

type ExpenseSlice = {
  category: string;
  amount: number;
  share: number;
  color: string;
};

type DashboardState = {
  total: number;
  expenseCount: number;
  slices: ExpenseSlice[];
  gradient: string;
  monthlyExpenses: Array<{
    id: string;
    description: string;
    icon: string;
    category: string;
    amount: number;
    spentAt: string;
  }>;
};

@Component({
  selector: 'app-dashboard-page',
  imports: [AsyncPipe, DatePipe, MoneyPipe, DateInputComponent],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {
  private readonly authService = inject(AuthService);
  private readonly expenseService = inject(ExpenseService);
  protected readonly preferencesService = inject(UserPreferencesService);
  protected readonly selectedCategory = signal('');
  protected readonly dateFilterPreset = signal<'currentMonth' | 'last3Months' | 'custom'>('currentMonth');
  protected readonly filterStartDate = signal(this.getCurrentMonthRange().startDate);
  protected readonly filterEndDate = signal(this.getCurrentMonthRange().endDate);

  protected readonly dashboard$ = this.authService.user$.pipe(
    switchMap((user): Observable<DashboardState> => {
      if (!user) {
        return EMPTY;
      }

      return this.expenseService.expensesForUser(user.uid).pipe(map((expenses) => this.buildDashboardState(expenses)));
    }),
  );

  protected setSelectedCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected setDateFilterPreset(rawPreset: string): void {
    const preset = this.normalizePreset(rawPreset);
    this.dateFilterPreset.set(preset);

    if (preset === 'currentMonth') {
      const range = this.getCurrentMonthRange();
      this.filterStartDate.set(range.startDate);
      this.filterEndDate.set(range.endDate);
      return;
    }

    if (preset === 'last3Months') {
      const range = this.getLastThreeMonthsRange();
      this.filterStartDate.set(range.startDate);
      this.filterEndDate.set(range.endDate);
    }
  }

  protected setFilterStartDate(value: string): void {
    this.filterStartDate.set(value);
    this.dateFilterPreset.set('custom');
  }

  protected setFilterEndDate(value: string): void {
    this.filterEndDate.set(value);
    this.dateFilterPreset.set('custom');
  }

  protected activeRangeLabel(): string {
    const preset = this.dateFilterPreset();
    if (preset === 'currentMonth') {
      return 'Mes actual';
    }

    if (preset === 'last3Months') {
      return 'Ultimos 3 meses';
    }

    return 'Rango personalizado';
  }

  protected getSelectedCategorySummary(dashboard: DashboardState): {
    category: string;
    total: number;
    count: number;
    average: number;
    items: DashboardState['monthlyExpenses'];
  } | null {
    const selectedCategory = this.selectedCategory();
    if (!selectedCategory) {
      return null;
    }

    const items = dashboard.monthlyExpenses.filter((item) => item.category === selectedCategory);
    if (!items.length) {
      return {
        category: selectedCategory,
        total: 0,
        count: 0,
        average: 0,
        items: [],
      };
    }

    const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return {
      category: selectedCategory,
      total,
      count: items.length,
      average: total / items.length,
      items,
    };
  }

  private buildDashboardState(expenses: Array<{ id: string; description: string; icon: string; amount: number; category: string; spentAt: string }>): DashboardState {
    const range = this.getActiveDateRange();
    const monthlyExpenses = expenses
      .filter((expense) => {
      const spentDate = parseIsoDateAsLocalDate(expense.spentAt);
      return spentDate >= range.start && spentDate <= range.end;
      })
      .sort((left, right) => right.spentAt.localeCompare(left.spentAt));

    const total = monthlyExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const totalsByCategory = new Map<string, number>();

    for (const expense of monthlyExpenses) {
      const key = expense.category || 'Sin categoria';
      totalsByCategory.set(key, (totalsByCategory.get(key) ?? 0) + Number(expense.amount || 0));
    }

    const palette = ['#78aef6', '#78d7c5', '#ffd37e', '#f79cb4', '#b9a0ff', '#8fd3ff', '#f1a975', '#9ad06f'];
    const slices = Array.from(totalsByCategory.entries())
      .map(([category, amount], index) => ({
        category,
        amount,
        share: total > 0 ? amount / total : 0,
        color: palette[index % palette.length],
      }))
      .sort((left, right) => right.amount - left.amount);

    const gradient = this.buildGradient(slices);

    return {
      total,
      expenseCount: monthlyExpenses.length,
      slices,
      gradient,
      monthlyExpenses,
    };
  }

  private buildGradient(slices: ExpenseSlice[]): string {
    if (!slices.length) {
      return 'conic-gradient(#dcecff 0% 100%)';
    }

    let cursor = 0;
    const chunks: string[] = [];

    for (const slice of slices) {
      const start = cursor;
      cursor += slice.share * 100;
      const end = Math.min(100, cursor);
      chunks.push(`${slice.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
    }

    if (cursor < 100 && slices.length) {
      chunks.push(`${slices[0].color} ${cursor.toFixed(2)}% 100%`);
    }

    return `conic-gradient(${chunks.join(', ')})`;
  }

  private getActiveDateRange(): { start: Date; end: Date } {
    const start = parseIsoDateAsLocalDate(this.filterStartDate());
    const end = parseIsoDateAsLocalDate(this.filterEndDate());

    if (start <= end) {
      return { start, end };
    }

    return { start: end, end: start };
  }

  private getCurrentMonthRange(): { startDate: string; endDate: string } {
    const today = new Date();
    return {
      startDate: toIsoDateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
      endDate: toIsoDateKey(today),
    };
  }

  private getLastThreeMonthsRange(): { startDate: string; endDate: string } {
    const today = new Date();
    return {
      startDate: toIsoDateKey(new Date(today.getFullYear(), today.getMonth() - 2, 1)),
      endDate: toIsoDateKey(today),
    };
  }

  private normalizePreset(rawPreset: string): 'currentMonth' | 'last3Months' | 'custom' {
    if (rawPreset === 'last3Months') {
      return 'last3Months';
    }

    if (rawPreset === 'custom') {
      return 'custom';
    }

    return 'currentMonth';
  }
}
