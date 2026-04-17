import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { combineLatest, EMPTY, firstValueFrom, map, Observable, switchMap } from 'rxjs';
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

interface PendingMovement {
  sourceId: string;
  kind: 'expense' | 'income';
  dueDate: string;
  dueDateKey: string;
  amount: number;
  category: string;
  icon: string;
  name: string;
  isOverdue: boolean;
}

type MovementItem = {
  id: string;
  kind: 'income' | 'expense';
  icon: string;
  title: string;
  category: string;
  amount: number;
  date: string;
};

@Component({
  selector: 'app-movements-page',
  imports: [AsyncPipe, DatePipe, ReactiveFormsModule, MoneyPipe, DateInputComponent],
  templateUrl: './movements-page.component.html',
  styleUrl: './movements-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly incomeService = inject(IncomeService);
  private readonly expenseService = inject(ExpenseService);
  private readonly expenseCatalogService = inject(ExpenseCatalogService);
  private readonly incomeCatalogService = inject(IncomeCatalogService);
  private readonly pendingExpenseService = inject(PendingExpenseService);
  protected readonly preferencesService = inject(UserPreferencesService);

  protected readonly user$ = this.authService.user$;
  protected readonly eventSaving = signal(false);
  protected readonly eventErrorMessage = signal('');
  protected readonly obligationProcessingKey = signal('');
  protected readonly selectedObligation = signal<PendingMovement | null>(null);
  protected readonly obligationConfirmAmount = signal(0);
  protected readonly movementProcessingKey = signal('');
  protected readonly movementErrorMessage = signal('');
  protected readonly exportErrorMessage = signal('');
  protected readonly dueDateFilterPreset = signal<'upcoming30Days' | 'upcoming15Days' | 'currentMonth' | 'currentFortnight'>('upcoming30Days');
  protected readonly movementDateFilterPreset = signal<
    'upcoming30Days' | 'upcoming15Days' | 'currentFortnight' | 'currentMonth' | 'custom'
  >('currentMonth');
  protected readonly movementFilterStartDate = signal(this.getCurrentMonthRange().startDate);
  protected readonly movementFilterEndDate = signal(this.getCurrentMonthRange().endDate);

  constructor() {
    effect(() => {
      this.dueDateFilterPreset.set(this.preferencesService.dueObligationsFilterPreset());
    });
  }

  protected readonly eventForm = this.fb.nonNullable.group({
    kind: ['expense' as 'expense' | 'income', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    eventDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    expenseCatalogItemId: [''],
    incomeCatalogItemId: [''],
  });

  protected readonly catalogItems$ = this.user$.pipe(
    switchMap((user): Observable<ExpenseCatalogItem[]> => {
      if (!user) {
        return EMPTY;
      }

      return this.expenseCatalogService.itemsForUser(user.uid);
    }),
  );

  protected readonly incomeCatalogItems$ = this.user$.pipe(
    switchMap((user): Observable<IncomeCatalogItem[]> => {
      if (!user) {
        return EMPTY;
      }

      return this.incomeCatalogService.itemsForUser(user.uid);
    }),
  );

  protected readonly dueObligations$ = this.user$.pipe(
    switchMap((user): Observable<PendingMovement[]> => {
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
        map(([pendingExpenses, expenseCatalogItems, expenses, incomeCatalogItems, incomes]) => {
          const range = this.getPendingExpansionRange(pendingExpenses, expenseCatalogItems, incomeCatalogItems);
          return this.expandPendingForRange(
            range.start,
            range.end,
            pendingExpenses,
            expenseCatalogItems,
            expenses,
            incomeCatalogItems,
            incomes,
          );
        }),
      );
    }),
  );

  protected readonly movements$ = this.user$.pipe(
    switchMap((user): Observable<MovementItem[]> => {
      if (!user) {
        return EMPTY;
      }

      return combineLatest([
        this.incomeService.incomesForUser(user.uid),
        this.expenseService.expensesForUser(user.uid),
      ]).pipe(
        map(([incomes, expenses]) => {
          return [
            ...incomes.map((item) => ({
              id: item.id,
              kind: 'income' as const,
              icon: item.icon,
              title: item.description,
              category: item.category,
              amount: item.amount,
              date: item.receivedAt,
            })),
            ...expenses.map((item) => ({
              id: item.id,
              kind: 'expense' as const,
              icon: item.icon,
              title: item.description,
              category: item.category,
              amount: item.amount,
              date: item.spentAt,
            })),
          ]
            .sort((left, right) => right.date.localeCompare(left.date))
            .slice(0, 250);
        }),
      );
    }),
  );

  protected setMovementDateFilterPreset(rawPreset: string): void {
    const preset = this.normalizePreset(rawPreset);
    this.movementDateFilterPreset.set(preset);

    if (preset === 'custom') {
      return;
    }

    const range = this.getMovementPresetRange(preset);
    this.movementFilterStartDate.set(toIsoDateKey(range.start));
    this.movementFilterEndDate.set(toIsoDateKey(range.end));
  }

  protected setMovementFilterStartDate(value: string): void {
    this.movementFilterStartDate.set(value);
    this.movementDateFilterPreset.set('custom');
  }

  protected setMovementFilterEndDate(value: string): void {
    this.movementFilterEndDate.set(value);
    this.movementDateFilterPreset.set('custom');
  }

  protected setDueDateFilterPreset(rawPreset: string): void {
    const preset = this.normalizeDuePreset(rawPreset);
    this.dueDateFilterPreset.set(preset);
    void this.preferencesService.saveDueObligationsFilterPreset(preset);
  }

  protected dueActiveRangeLabel(): string {
    const preset = this.dueDateFilterPreset();
    if (preset === 'upcoming15Days') {
      return 'Próximos 15 días';
    }

    if (preset === 'currentFortnight') {
      return 'Quincena actual';
    }

    if (preset === 'currentMonth') {
      return 'Mes actual';
    }

    return 'Próximos 30 días';
  }

  protected filteredDueObligations(obligations: PendingMovement[]): PendingMovement[] {
    const range = this.getDueActiveDateRange();
    const preset = this.dueDateFilterPreset();
    return obligations.filter((item) => {
      const dueDate = parseIsoDateAsLocalDate(item.dueDate);

      if (preset === 'currentFortnight' && item.isOverdue) {
        return true;
      }

      return dueDate >= range.start && dueDate <= range.end;
    });
  }

  protected movementActiveRangeLabel(): string {
    const preset = this.movementDateFilterPreset();
    if (preset === 'upcoming30Days') {
      return 'Próximos 30 días';
    }

    if (preset === 'upcoming15Days') {
      return 'Próximos 15 días';
    }

    if (preset === 'currentFortnight') {
      return 'Quincena actual';
    }

    if (preset === 'currentMonth') {
      return 'Mes actual';
    }

    return 'Rango personalizado';
  }

  protected filteredMovements(movements: MovementItem[]): MovementItem[] {
    const range = this.getMovementActiveDateRange();
    return movements.filter((item) => {
      const date = parseIsoDateAsLocalDate(item.date);
      return date >= range.start && date <= range.end;
    });
  }

  protected exportMovementsCsv(movements: MovementItem[]): void {
    this.exportErrorMessage.set('');

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.exportErrorMessage.set('No fue posible exportar en este entorno.');
      return;
    }

    const filtered = this.filteredMovements(movements);
    if (!filtered.length) {
      this.exportErrorMessage.set('No hay movimientos en el rango seleccionado para exportar.');
      return;
    }

    const csvLines = [
      'tipo,fecha,categoria,descripcion,monto',
      ...filtered.map((movement) => {
        return [
          movement.kind === 'income' ? 'Ingreso' : 'Gasto',
          movement.date,
          movement.category,
          movement.title,
          movement.amount.toFixed(2),
        ]
          .map((value) => this.escapeCsv(String(value)))
          .join(',');
      }),
    ];

    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `movimientos-${timestamp}.csv`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  protected async saveEvent(): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user || this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      return;
    }

    this.eventSaving.set(true);
    this.eventErrorMessage.set('');

    try {
      const event = this.eventForm.getRawValue();

      if (event.kind === 'income') {
        const incomeCatalogItems = await firstValueFrom(this.incomeCatalogItems$);
        const selectedIncome = incomeCatalogItems.find((item) => item.id === event.incomeCatalogItemId);

        if (!selectedIncome) {
          this.eventErrorMessage.set('Selecciona un ingreso del catalogo.');
          return;
        }

        await this.incomeService.addIncome(user.uid, {
          description: selectedIncome.name,
          icon: selectedIncome.icon,
          amount: Number(event.amount || 0),
          category: selectedIncome.category,
          receivedAt: event.eventDate,
        });
      } else {
        const catalogItems = await firstValueFrom(this.catalogItems$);
        const selectedItem = catalogItems.find((item) => item.id === event.expenseCatalogItemId);

        if (!selectedItem) {
          this.eventErrorMessage.set('Selecciona un gasto del catalogo.');
          return;
        }

        await this.expenseService.addExpense(user.uid, {
          description: selectedItem.name,
          icon: selectedItem.icon,
          amount: Number(event.amount || 0),
          category: selectedItem.category,
          spentAt: event.eventDate,
        });
      }

      this.eventForm.patchValue({
        amount: 0,
        eventDate: new Date().toISOString().slice(0, 10),
        expenseCatalogItemId: '',
        incomeCatalogItemId: '',
      });
    } catch {
      this.eventErrorMessage.set('No fue posible guardar el movimiento.');
    } finally {
      this.eventSaving.set(false);
    }
  }

  protected openObligationDialog(obligation: PendingMovement): void {
    this.eventErrorMessage.set('');
    this.selectedObligation.set(obligation);
    this.obligationConfirmAmount.set(obligation.amount);
  }

  protected closeObligationDialog(): void {
    this.selectedObligation.set(null);
    this.obligationConfirmAmount.set(0);
  }

  protected setObligationConfirmAmount(rawValue: string): void {
    const parsed = Number(rawValue);
    this.obligationConfirmAmount.set(Number.isFinite(parsed) ? parsed : 0);
  }

  protected async confirmObligationRegistration(): Promise<void> {
    const obligation = this.selectedObligation();
    if (!obligation) {
      return;
    }

    const amount = Number(this.obligationConfirmAmount() || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.eventErrorMessage.set('El monto del pendiente debe ser mayor que cero.');
      return;
    }

    const user = await this.getCurrentUser();
    if (!user) {
      return;
    }

    const operationKey = `${obligation.kind}:${obligation.sourceId}:${obligation.dueDateKey}`;
    this.obligationProcessingKey.set(operationKey);

    try {
      if (obligation.kind === 'expense') {
        await this.expenseService.addExpense(user.uid, {
          description: obligation.name,
          icon: obligation.icon,
          amount,
          category: obligation.category,
          spentAt: obligation.dueDate,
        });

        if (!obligation.sourceId.startsWith('catalog:')) {
          await this.pendingExpenseService.markDueDateCompleted(user.uid, obligation.sourceId, obligation.dueDateKey);
        }
      } else {
        await this.incomeService.addIncome(user.uid, {
          description: obligation.name,
          icon: obligation.icon,
          amount,
          category: obligation.category,
          receivedAt: obligation.dueDate,
        });
      }

      this.closeObligationDialog();
    } finally {
      this.obligationProcessingKey.set('');
    }
  }

  protected async revertMovement(movement: MovementItem): Promise<void> {
    if (this.movementProcessingKey()) {
      return;
    }

    const accepted =
      typeof window !== 'undefined' &&
      window.confirm(`Se revertira el movimiento "${movement.title}". Deseas continuar?`);
    if (!accepted) {
      return;
    }

    const user = await this.getCurrentUser();
    if (!user) {
      return;
    }

    const operationKey = `${movement.kind}:${movement.id}`;
    this.movementProcessingKey.set(operationKey);
    this.movementErrorMessage.set('');

    try {
      if (movement.kind === 'income') {
        await this.incomeService.deleteIncome(user.uid, movement.id);
      } else {
        await this.expenseService.deleteExpense(user.uid, movement.id);
      }
    } catch {
      this.movementErrorMessage.set('No fue posible revertir el movimiento.');
    } finally {
      this.movementProcessingKey.set('');
    }
  }

  private expandPendingForRange(
    rangeStart: Date,
    rangeEnd: Date,
    pendingExpenses: PendingExpense[],
    expenseCatalogItems: ExpenseCatalogItem[],
    expenses: Array<{ description: string; spentAt: string; category: string }>,
    incomeCatalogItems: IncomeCatalogItem[],
    incomes: Array<{ description: string; receivedAt: string; category: string }>,
  ): PendingMovement[] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthInfos = this.getMonthInfosBetween(rangeStart, rangeEnd);
    const expenseRegistry = new Set(expenses.map((expense) => `${expense.description}|${expense.spentAt}|${expense.category}`));
    const incomeRegistry = new Set(incomes.map((income) => `${income.description}|${income.receivedAt}|${income.category}`));

    const obligations: PendingMovement[] = [];

    for (const item of pendingExpenses) {
      if (!item.active || item.type !== 'Recurrente') {
        continue;
      }

      const createdAtDate = this.toLocalDateFloor(item.createdAt);

      for (const schedule of this.normalizeSchedules(item)) {
        for (const monthInfo of monthInfos) {
          const day = schedule.day;
          if (day < 1 || day > monthInfo.monthLastDay) {
            continue;
          }

          const dueDate = new Date(monthInfo.year, monthInfo.month, day);
          if (dueDate < rangeStart || dueDate > rangeEnd) {
            continue;
          }

          if (this.isBeforeCreationMonth(dueDate, createdAtDate)) {
            continue;
          }

          const dueDateKey = toIsoDateKey(dueDate);
          if (item.completedDueDates.includes(dueDateKey)) {
            continue;
          }

          obligations.push({
            sourceId: item.id,
            kind: 'expense',
            dueDate: dueDate.toISOString().slice(0, 10),
            dueDateKey,
            amount: schedule.amount,
            category: item.category,
            icon: item.icon,
            name: item.name,
            isOverdue: dueDate < today,
          });
        }
      }
    }

    for (const item of expenseCatalogItems) {
      if (item.type === 'Eventual') {
        continue;
      }

      const createdAtDate = this.toLocalDateFloor(item.createdAt);

      const debtMode =
        item.type === 'Deuda'
          ? item.debtPaymentMode ?? 'Recurrente'
          : null;

      const singleDate =
        item.type === 'Deuda' && debtMode === 'PagoUnico' && item.endDate
          ? parseIsoDateAsLocalDate(item.endDate)
          : null;
      if (item.type === 'Deuda' && debtMode === 'PagoUnico' && !singleDate) {
        continue;
      }

      const endDate = !item.isIndefinite && item.endDate ? parseIsoDateAsLocalDate(item.endDate) : null;

      for (const schedule of this.normalizeExpenseCatalogSchedules(item)) {
        for (const monthInfo of monthInfos) {
          const day = schedule.day;
          if (day < 1 || day > monthInfo.monthLastDay) {
            continue;
          }

          const dueDate = new Date(monthInfo.year, monthInfo.month, day);
          if (dueDate < rangeStart || dueDate > rangeEnd) {
            continue;
          }

          if (this.isBeforeCreationMonth(dueDate, createdAtDate)) {
            continue;
          }

          if (singleDate) {
            if (
              dueDate.getFullYear() !== singleDate.getFullYear() ||
              dueDate.getMonth() !== singleDate.getMonth() ||
              dueDate.getDate() !== singleDate.getDate()
            ) {
              continue;
            }
          }

          if (endDate && dueDate > endDate) {
            continue;
          }

          const dueDateKey = toIsoDateKey(dueDate);
          const dueDateIso = dueDate.toISOString().slice(0, 10);
          const alreadyRegistered = expenseRegistry.has(`${item.name}|${dueDateIso}|${item.category}`);

          if (alreadyRegistered) {
            continue;
          }

          obligations.push({
            sourceId: `catalog:${item.id}`,
            kind: 'expense',
            dueDate: dueDateIso,
            dueDateKey,
            amount: schedule.amount,
            category: item.category,
            icon: item.icon,
            name: item.name,
            isOverdue: dueDate < today,
          });
        }
      }
    }

    for (const item of incomeCatalogItems) {
      if (item.type !== 'Recurrente') {
        continue;
      }

      const createdAtDate = this.toLocalDateFloor(item.createdAt);

      const endDate = !item.isIndefinite && item.endDate ? parseIsoDateAsLocalDate(item.endDate) : null;

      for (const schedule of this.normalizeIncomeSchedules(item)) {
        for (const monthInfo of monthInfos) {
          const day = schedule.day;
          if (day < 1 || day > monthInfo.monthLastDay) {
            continue;
          }

          const dueDate = new Date(monthInfo.year, monthInfo.month, day);
          if (dueDate < rangeStart || dueDate > rangeEnd) {
            continue;
          }

          if (this.isBeforeCreationMonth(dueDate, createdAtDate)) {
            continue;
          }

          if (endDate && dueDate > endDate) {
            continue;
          }

          const dueDateKey = toIsoDateKey(dueDate);
          const dueDateIso = dueDate.toISOString().slice(0, 10);
          const alreadyRegistered = incomeRegistry.has(`${item.name}|${dueDateIso}|${item.category}`);

          if (alreadyRegistered) {
            continue;
          }

          obligations.push({
            sourceId: item.id,
            kind: 'income',
            dueDate: dueDateIso,
            dueDateKey,
            amount: schedule.amount,
            category: item.category,
            icon: item.icon,
            name: item.name,
            isOverdue: dueDate < today,
          });
        }
      }
    }

    const unique = new Map<string, PendingMovement>();
    for (const obligation of obligations) {
      const key = `${obligation.kind}|${obligation.category}|${obligation.name}|${obligation.dueDate}|${obligation.amount}`;
      if (!unique.has(key)) {
        unique.set(key, obligation);
      }
    }

    return Array.from(unique.values()).sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  }

  private normalizeSchedules(item: PendingExpense): Array<{ day: number; amount: number }> {
    if (item.paymentSchedules?.length) {
      return [...item.paymentSchedules].sort((a, b) => a.day - b.day);
    }

    return (item.dueDays || []).map((day) => ({ day, amount: item.amount }));
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

  private normalizeExpenseCatalogSchedules(item: ExpenseCatalogItem): Array<{ day: number; amount: number }> {
    if (!item.paymentSchedules?.length) {
      return [];
    }

    return [...item.paymentSchedules].sort((a, b) => a.day - b.day);
  }

  private getDueActiveDateRange(): { start: Date; end: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const preset = this.dueDateFilterPreset();

    if (preset === 'currentMonth') {
      return {
        start: new Date(today.getFullYear(), today.getMonth(), 1),
        end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
      };
    }

    if (preset === 'currentFortnight') {
      const day = today.getDate();

      if (day >= 15 && day <= 29) {
        return {
          start: new Date(today.getFullYear(), today.getMonth(), 15),
          end: new Date(today.getFullYear(), today.getMonth(), this.clampDayInMonth(today.getFullYear(), today.getMonth(), 29)),
        };
      }

      if (day >= 30) {
        return {
          start: new Date(today.getFullYear(), today.getMonth(), this.clampDayInMonth(today.getFullYear(), today.getMonth(), 30)),
          end: new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            this.clampDayInMonth(today.getFullYear(), today.getMonth() + 1, 14),
          ),
        };
      }

      return {
        start: new Date(
          today.getFullYear(),
          today.getMonth() - 1,
          this.clampDayInMonth(today.getFullYear(), today.getMonth() - 1, 30),
        ),
        end: new Date(today.getFullYear(), today.getMonth(), this.clampDayInMonth(today.getFullYear(), today.getMonth(), 14)),
      };
    }

    const dayWindow = preset === 'upcoming15Days' ? 15 : 30;
    return {
      start: today,
      end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayWindow),
    };
  }

  private getPendingExpansionRange(
    pendingExpenses: PendingExpense[],
    expenseCatalogItems: ExpenseCatalogItem[],
    incomeCatalogItems: IncomeCatalogItem[],
  ): { start: Date; end: Date } {
    const now = new Date();
    const createdAtDates = [
      ...pendingExpenses.map((item) => this.toLocalDateFloor(item.createdAt)),
      ...expenseCatalogItems.map((item) => this.toLocalDateFloor(item.createdAt)),
      ...incomeCatalogItems.map((item) => this.toLocalDateFloor(item.createdAt)),
    ].filter((date) => Number.isFinite(date.getTime()));

    const earliestCreatedAt = createdAtDates.length
      ? createdAtDates.reduce((earliest, current) => (current < earliest ? current : earliest), createdAtDates[0])
      : now;

    return {
      start: new Date(earliestCreatedAt.getFullYear(), earliestCreatedAt.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 2, 31),
    };
  }

  private clampDayInMonth(year: number, month: number, requestedDay: number): number {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return Math.max(1, Math.min(requestedDay, lastDay));
  }

  private toLocalDateFloor(rawValue: string): Date {
    const raw = String(rawValue || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      return parseIsoDateAsLocalDate(raw.slice(0, 10));
    }

    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) {
      return new Date(1970, 0, 1);
    }

    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  private isBeforeCreationMonth(dueDate: Date, createdAtDate: Date): boolean {
    if (dueDate.getFullYear() < createdAtDate.getFullYear()) {
      return true;
    }

    if (dueDate.getFullYear() > createdAtDate.getFullYear()) {
      return false;
    }

    return dueDate.getMonth() < createdAtDate.getMonth();
  }

  private getMonthInfosBetween(start: Date, end: Date): Array<{ year: number; month: number; monthLastDay: number }> {
    const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    const months: Array<{ year: number; month: number; monthLastDay: number }> = [];
    const cursor = new Date(startMonth);

    while (cursor <= endMonth) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      months.push({
        year,
        month,
        monthLastDay: new Date(year, month + 1, 0).getDate(),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
  }

  private getMovementActiveDateRange(): { start: Date; end: Date } {
    const start = parseIsoDateAsLocalDate(this.movementFilterStartDate());
    const end = parseIsoDateAsLocalDate(this.movementFilterEndDate());

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

  private getMovementPresetRange(
    preset: 'upcoming30Days' | 'upcoming15Days' | 'currentFortnight' | 'currentMonth',
  ): { start: Date; end: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (preset === 'currentMonth') {
      return {
        start: new Date(today.getFullYear(), today.getMonth(), 1),
        end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
      };
    }

    if (preset === 'currentFortnight') {
      const day = today.getDate();

      if (day >= 15 && day <= 29) {
        return {
          start: new Date(today.getFullYear(), today.getMonth(), 15),
          end: new Date(today.getFullYear(), today.getMonth(), this.clampDayInMonth(today.getFullYear(), today.getMonth(), 29)),
        };
      }

      if (day >= 30) {
        return {
          start: new Date(today.getFullYear(), today.getMonth(), this.clampDayInMonth(today.getFullYear(), today.getMonth(), 30)),
          end: new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            this.clampDayInMonth(today.getFullYear(), today.getMonth() + 1, 14),
          ),
        };
      }

      return {
        start: new Date(
          today.getFullYear(),
          today.getMonth() - 1,
          this.clampDayInMonth(today.getFullYear(), today.getMonth() - 1, 30),
        ),
        end: new Date(today.getFullYear(), today.getMonth(), this.clampDayInMonth(today.getFullYear(), today.getMonth(), 14)),
      };
    }

    const dayWindow = preset === 'upcoming15Days' ? 15 : 30;
    return {
      start: today,
      end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayWindow),
    };
  }

  private normalizePreset(
    rawPreset: string,
  ): 'upcoming30Days' | 'upcoming15Days' | 'currentFortnight' | 'currentMonth' | 'custom' {
    if (rawPreset === 'upcoming15Days') {
      return 'upcoming15Days';
    }

    if (rawPreset === 'currentFortnight') {
      return 'currentFortnight';
    }

    if (rawPreset === 'currentMonth') {
      return 'currentMonth';
    }

    if (rawPreset === 'custom') {
      return 'custom';
    }

    return 'upcoming30Days';
  }

  private normalizeDuePreset(rawPreset: string): 'upcoming30Days' | 'upcoming15Days' | 'currentMonth' | 'currentFortnight' {
    if (rawPreset === 'upcoming15Days') {
      return 'upcoming15Days';
    }

    if (rawPreset === 'currentFortnight') {
      return 'currentFortnight';
    }

    if (rawPreset === 'currentMonth') {
      return 'currentMonth';
    }

    return 'upcoming30Days';
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  }

  private getCurrentUser(): Promise<{ uid: string } | null> {
    return firstValueFrom(this.user$).then((user) => (user ? { uid: user.uid } : null));
  }
}
