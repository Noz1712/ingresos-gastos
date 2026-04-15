import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { combineLatest, EMPTY, map, Observable, switchMap } from 'rxjs';
import { DateInputComponent } from '../components/date-input.component';
import { ExpenseCatalogItem } from '../models/expense-catalog.model';
import { IncomeCatalogItem } from '../models/income-catalog.model';
import { PendingExpense } from '../models/pending-expense.model';
import { MoneyPipe } from '../pipes/money.pipe';
import { AuthService } from '../services/auth.service';
import { ExpenseCatalogService } from '../services/expense-catalog.service';
import { ExpenseService } from '../services/expense.service';
import { IncomeCatalogService } from '../services/income-catalog.service';
import { IncomeService } from '../services/income.service';
import { PendingExpenseService } from '../services/pending-expense.service';
import { UserPreferencesService } from '../services/user-preferences.service';
import { parseIsoDateAsLocalDate, toIsoDateKey } from '../utils/date-utils';

type DashboardSlice = {
  category: string;
  amount: number;
  share: number;
  color: string;
};

type DashboardItem = {
  id: string;
  description: string;
  icon: string;
  category: string;
  amount: number;
  date: string;
};

type DashboardState = {
  total: number;
  movementCount: number;
  slices: DashboardSlice[];
  gradient: string;
  items: DashboardItem[];
};

type BudgetObligation = {
  id: string;
  name: string;
  icon: string;
  category: string;
  amount: number;
  dueDate: string;
  dueDateKey: string;
  isOverdue: boolean;
};

type BudgetState = {
  pendingExpenses: BudgetObligation[];
  pendingIncomes: BudgetObligation[];
  pendingExpenseTotal: number;
  pendingIncomeTotal: number;
  projectedBalance: number;
  registeredExpenseTotal: number;
  registeredIncomeTotal: number;
  registeredBalance: number;
  expenseCompletionPercent: number;
  incomeCapturePercent: number;
  overdueExpenseCount: number;
  overdueIncomeCount: number;
  upcomingExpenseTotal: number;
  upcomingIncomeTotal: number;
  expenseCategoryBreakdown: DashboardSlice[];
  incomeCategoryBreakdown: DashboardSlice[];
  upcomingTimeline: Array<{
    dueDate: string;
    expenseAmount: number;
    incomeAmount: number;
    netAmount: number;
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
  private readonly incomeService = inject(IncomeService);
  private readonly pendingExpenseService = inject(PendingExpenseService);
  private readonly expenseCatalogService = inject(ExpenseCatalogService);
  private readonly incomeCatalogService = inject(IncomeCatalogService);
  protected readonly preferencesService = inject(UserPreferencesService);
  protected readonly dashboardMode = signal<'expense' | 'income' | 'budget'>('expense');
  protected readonly selectedCategory = signal('');
  protected readonly dateFilterPreset = signal<'currentMonth' | 'last3Months' | 'custom'>('currentMonth');
  protected readonly filterStartDate = signal(this.getCurrentMonthRange().startDate);
  protected readonly filterEndDate = signal(this.getCurrentMonthRange().endDate);

  protected readonly expenseDashboard$ = this.authService.user$.pipe(
    switchMap((user): Observable<DashboardState> => {
      if (!user) {
        return EMPTY;
      }

      return this.expenseService.expensesForUser(user.uid).pipe(
        map((expenses) =>
          this.buildDashboardState(
            expenses.map((expense) => ({
              id: expense.id,
              description: expense.description,
              icon: expense.icon,
              category: expense.category,
              amount: expense.amount,
              date: expense.spentAt,
            })),
          ),
        ),
      );
    }),
  );

  protected readonly incomeDashboard$ = this.authService.user$.pipe(
    switchMap((user): Observable<DashboardState> => {
      if (!user) {
        return EMPTY;
      }

      return this.incomeService.incomesForUser(user.uid).pipe(
        map((incomes) =>
          this.buildDashboardState(
            incomes.map((income) => ({
              id: income.id,
              description: income.description,
              icon: income.icon,
              category: income.category,
              amount: income.amount,
              date: income.receivedAt,
            })),
          ),
        ),
      );
    }),
  );

  protected readonly budgetDashboard$ = this.authService.user$.pipe(
    switchMap((user): Observable<BudgetState> => {
      if (!user) {
        return EMPTY;
      }

      return combineLatest([
        this.pendingExpenseService.itemsForUser(user.uid),
        this.expenseCatalogService.itemsForUser(user.uid),
        this.expenseService.expensesForUser(user.uid),
        this.incomeCatalogService.itemsForUser(user.uid),
        this.incomeService.incomesForUser(user.uid),
      ]).pipe(
        map(([pendingExpenses, expenseCatalogItems, expenses, incomeCatalogItems, incomes]) =>
          this.buildBudgetState(pendingExpenses, expenseCatalogItems, expenses, incomeCatalogItems, incomes),
        ),
      );
    }),
  );

  protected setDashboardMode(rawMode: string): void {
    this.dashboardMode.set(rawMode === 'income' || rawMode === 'budget' ? rawMode : 'expense');
    this.selectedCategory.set('');
  }

  protected dashboardTitle(): string {
    if (this.dashboardMode() === 'income') {
      return 'Distribucion de ingresos';
    }

    if (this.dashboardMode() === 'budget') {
      return 'Presupuesto mensual';
    }

    return 'Distribucion de gastos';
  }

  protected dashboardCopy(): string {
    if (this.dashboardMode() === 'income') {
      return 'Vista rapida de ingresos por categoria en formato pastel segun el rango seleccionado.';
    }

    if (this.dashboardMode() === 'budget') {
      return 'Aqui ves lo que tienes pendiente por pagar y los ingresos que aun no has registrado este mes.';
    }

    return 'Vista rapida de gastos por categoria en formato pastel segun el rango seleccionado.';
  }

  protected pieTitle(): string {
    return this.dashboardMode() === 'income' ? 'Pastel de ingresos' : 'Pastel de gastos';
  }

  protected dashboardTypeLabel(): string {
    return this.dashboardMode() === 'income' ? 'ingresos' : 'gastos';
  }

  protected budgetStatusLabel(budget: BudgetState): string {
    const balance = budget.projectedBalance;
    if (balance > 0) {
      return 'Superavit proyectado';
    }

    if (balance < 0) {
      return 'Deficit proyectado';
    }

    return 'Balance proyectado en cero';
  }

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
    items: DashboardState['items'];
  } | null {
    const selectedCategory = this.selectedCategory();
    if (!selectedCategory) {
      return null;
    }

    const items = dashboard.items.filter((item) => item.category === selectedCategory);
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

  private buildDashboardState(items: DashboardItem[]): DashboardState {
    const range = this.getActiveDateRange();
    const filteredItems = items
      .filter((item) => {
      const movementDate = parseIsoDateAsLocalDate(item.date);
      return movementDate >= range.start && movementDate <= range.end;
      })
      .sort((left, right) => right.date.localeCompare(left.date));

    const total = filteredItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalsByCategory = new Map<string, number>();

    for (const item of filteredItems) {
      const key = item.category || 'Sin categoria';
      totalsByCategory.set(key, (totalsByCategory.get(key) ?? 0) + Number(item.amount || 0));
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
      movementCount: filteredItems.length,
      slices,
      gradient,
      items: filteredItems,
    };
  }

  private buildBudgetState(
    pendingExpenses: PendingExpense[],
    expenseCatalogItems: ExpenseCatalogItem[],
    expenses: Array<{ description: string; spentAt: string; amount: number; category: string }>,
    incomeCatalogItems: IncomeCatalogItem[],
    incomes: Array<{ description: string; receivedAt: string; amount: number; category: string }>,
  ): BudgetState {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = new Date(year, month, now.getDate());
    const nextWeek = new Date(year, month, now.getDate() + 7);
    const monthLastDay = new Date(year, month + 1, 0).getDate();
    const expenseRegistry = new Set(expenses.map((expense) => `${expense.description}|${expense.spentAt}|${expense.category}`));
    const incomeRegistry = new Set(incomes.map((income) => `${income.description}|${income.receivedAt}|${income.category}`));

    const pendingExpenseItems: BudgetObligation[] = [];
    const pendingIncomeItems: BudgetObligation[] = [];

    for (const item of pendingExpenses) {
      if (!item.active || item.type !== 'Recurrente') {
        continue;
      }

      for (const schedule of this.normalizePendingSchedules(item)) {
        const day = schedule.day;
        if (day < 1 || day > monthLastDay) {
          continue;
        }

        const dueDate = new Date(year, month, day);
        const dueDateKey = toIsoDateKey(dueDate);
        if (item.completedDueDates.includes(dueDateKey)) {
          continue;
        }

        pendingExpenseItems.push({
          id: `pending:${item.id}:${dueDateKey}`,
          name: item.name,
          icon: item.icon,
          category: item.category,
          amount: schedule.amount,
          dueDate: dueDate.toISOString().slice(0, 10),
          dueDateKey,
          isOverdue: dueDate < today,
        });
      }
    }

    for (const item of expenseCatalogItems) {
      if (item.type === 'Eventual') {
        continue;
      }

      if (!item.isIndefinite && item.endDate) {
        const endDate = new Date(item.endDate);
        if (new Date(year, month, 1) > endDate) {
          continue;
        }
      }

      const debtMode = item.type === 'Deuda' ? item.debtPaymentMode ?? 'Recurrente' : null;

      for (const schedule of this.normalizeCatalogSchedules(item)) {
        const day = schedule.day;
        if (day < 1 || day > monthLastDay) {
          continue;
        }

        const dueDate = new Date(year, month, day);

        if (item.type === 'Deuda' && debtMode === 'PagoUnico') {
          const endDate = item.endDate ? new Date(`${item.endDate}T00:00:00`) : null;
          if (!endDate) {
            continue;
          }

          if (
            dueDate.getFullYear() !== endDate.getFullYear() ||
            dueDate.getMonth() !== endDate.getMonth() ||
            dueDate.getDate() !== endDate.getDate()
          ) {
            continue;
          }
        }

        const dueDateIso = dueDate.toISOString().slice(0, 10);
        if (expenseRegistry.has(`${item.name}|${dueDateIso}|${item.category}`)) {
          continue;
        }

        const dueDateKey = toIsoDateKey(dueDate);
        pendingExpenseItems.push({
          id: `catalog:${item.id}:${dueDateKey}`,
          name: item.name,
          icon: item.icon,
          category: item.category,
          amount: schedule.amount,
          dueDate: dueDateIso,
          dueDateKey,
          isOverdue: dueDate < today,
        });
      }
    }

    for (const item of incomeCatalogItems) {
      if (item.type !== 'Recurrente') {
        continue;
      }

      if (!item.isIndefinite && item.endDate) {
        const endDate = new Date(item.endDate);
        if (new Date(year, month, 1) > endDate) {
          continue;
        }
      }

      for (const schedule of this.normalizeIncomeSchedules(item)) {
        const day = schedule.day;
        if (day < 1 || day > monthLastDay) {
          continue;
        }

        const dueDate = new Date(year, month, day);
        const dueDateIso = dueDate.toISOString().slice(0, 10);
        if (incomeRegistry.has(`${item.name}|${dueDateIso}|${item.category}`)) {
          continue;
        }

        const dueDateKey = toIsoDateKey(dueDate);
        pendingIncomeItems.push({
          id: `income:${item.id}:${dueDateKey}`,
          name: item.name,
          icon: item.icon,
          category: item.category,
          amount: schedule.amount,
          dueDate: dueDateIso,
          dueDateKey,
          isOverdue: dueDate < today,
        });
      }
    }

    const uniqueExpenses = this.uniqueBudgetItems(pendingExpenseItems);
    const uniqueIncomes = this.uniqueBudgetItems(pendingIncomeItems);
    const pendingExpenseTotal = uniqueExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pendingIncomeTotal = uniqueIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const registeredExpenseTotal = expenses
      .filter((item) => {
        const spentDate = parseIsoDateAsLocalDate(item.spentAt);
        return spentDate.getFullYear() === year && spentDate.getMonth() === month;
      })
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const registeredIncomeTotal = incomes
      .filter((item) => {
        const receivedDate = parseIsoDateAsLocalDate(item.receivedAt);
        return receivedDate.getFullYear() === year && receivedDate.getMonth() === month;
      })
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expectedExpenseTotal = registeredExpenseTotal + pendingExpenseTotal;
    const expectedIncomeTotal = registeredIncomeTotal + pendingIncomeTotal;
    const expenseCompletionPercent = expectedExpenseTotal > 0 ? (registeredExpenseTotal / expectedExpenseTotal) * 100 : 0;
    const incomeCapturePercent = expectedIncomeTotal > 0 ? (registeredIncomeTotal / expectedIncomeTotal) * 100 : 0;

    const overdueExpenseCount = uniqueExpenses.filter((item) => item.isOverdue).length;
    const overdueIncomeCount = uniqueIncomes.filter((item) => item.isOverdue).length;

    const upcomingExpenseTotal = uniqueExpenses
      .filter((item) => {
        const date = parseIsoDateAsLocalDate(item.dueDate);
        return date >= today && date <= nextWeek;
      })
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const upcomingIncomeTotal = uniqueIncomes
      .filter((item) => {
        const date = parseIsoDateAsLocalDate(item.dueDate);
        return date >= today && date <= nextWeek;
      })
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expenseCategoryBreakdown = this.buildCategoryBreakdown(uniqueExpenses);
    const incomeCategoryBreakdown = this.buildCategoryBreakdown(uniqueIncomes);
    const upcomingTimeline = this.buildUpcomingTimeline(uniqueExpenses, uniqueIncomes, today);

    return {
      pendingExpenses: uniqueExpenses,
      pendingIncomes: uniqueIncomes,
      pendingExpenseTotal,
      pendingIncomeTotal,
      projectedBalance: pendingIncomeTotal - pendingExpenseTotal,
      registeredExpenseTotal,
      registeredIncomeTotal,
      registeredBalance: registeredIncomeTotal - registeredExpenseTotal,
      expenseCompletionPercent,
      incomeCapturePercent,
      overdueExpenseCount,
      overdueIncomeCount,
      upcomingExpenseTotal,
      upcomingIncomeTotal,
      expenseCategoryBreakdown,
      incomeCategoryBreakdown,
      upcomingTimeline,
    };
  }

  private buildGradient(slices: DashboardSlice[]): string {
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

  private normalizePendingSchedules(item: PendingExpense): Array<{ day: number; amount: number }> {
    if (item.paymentSchedules?.length) {
      return [...item.paymentSchedules].sort((a, b) => a.day - b.day);
    }

    return (item.dueDays || []).map((day) => ({ day, amount: item.amount }));
  }

  private normalizeCatalogSchedules(item: ExpenseCatalogItem): Array<{ day: number; amount: number }> {
    if (!item.paymentSchedules?.length) {
      return [];
    }

    return [...item.paymentSchedules].sort((a, b) => a.day - b.day);
  }

  private normalizeIncomeSchedules(item: IncomeCatalogItem): Array<{ day: number; amount: number }> {
    if (item.paymentSchedules?.length) {
      return [...item.paymentSchedules].sort((a, b) => a.day - b.day);
    }

    if (item.type === 'Recurrente' && Number(item.fixedAmount || 0) > 0) {
      return [{ day: 1, amount: item.fixedAmount }];
    }

    return [];
  }

  private uniqueBudgetItems(items: BudgetObligation[]): BudgetObligation[] {
    const unique = new Map<string, BudgetObligation>();
    for (const item of items) {
      const key = `${item.category}|${item.name}|${item.dueDate}|${item.amount}`;
      if (!unique.has(key)) {
        unique.set(key, item);
      }
    }

    return Array.from(unique.values()).sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  }

  private buildCategoryBreakdown(items: BudgetObligation[]): DashboardSlice[] {
    const totalsByCategory = new Map<string, number>();
    const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    for (const item of items) {
      const key = item.category || 'Sin categoria';
      totalsByCategory.set(key, (totalsByCategory.get(key) ?? 0) + Number(item.amount || 0));
    }

    const palette = ['#78aef6', '#78d7c5', '#ffd37e', '#f79cb4', '#b9a0ff', '#8fd3ff', '#f1a975', '#9ad06f'];

    return Array.from(totalsByCategory.entries())
      .map(([category, amount], index) => ({
        category,
        amount,
        share: total > 0 ? amount / total : 0,
        color: palette[index % palette.length],
      }))
      .sort((left, right) => right.amount - left.amount);
  }

  private buildUpcomingTimeline(
    pendingExpenses: BudgetObligation[],
    pendingIncomes: BudgetObligation[],
    today: Date,
  ): Array<{ dueDate: string; expenseAmount: number; incomeAmount: number; netAmount: number }> {
    const rows = new Map<string, { dueDate: string; expenseAmount: number; incomeAmount: number; netAmount: number }>();

    for (const item of pendingExpenses) {
      const key = item.dueDate;
      const current = rows.get(key) ?? { dueDate: key, expenseAmount: 0, incomeAmount: 0, netAmount: 0 };
      current.expenseAmount += Number(item.amount || 0);
      current.netAmount = current.incomeAmount - current.expenseAmount;
      rows.set(key, current);
    }

    for (const item of pendingIncomes) {
      const key = item.dueDate;
      const current = rows.get(key) ?? { dueDate: key, expenseAmount: 0, incomeAmount: 0, netAmount: 0 };
      current.incomeAmount += Number(item.amount || 0);
      current.netAmount = current.incomeAmount - current.expenseAmount;
      rows.set(key, current);
    }

    return Array.from(rows.values())
      .filter((item) => parseIsoDateAsLocalDate(item.dueDate) >= today)
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
      .slice(0, 10);
  }
}
