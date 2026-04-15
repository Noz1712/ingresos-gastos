import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EMPTY, firstValueFrom, map, Observable, switchMap } from 'rxjs';
import { CATEGORY_ICON_PRESETS } from '../models/category-icon-presets.model';
import { DEFAULT_EXPENSE_CATEGORIES } from '../models/expense.model';
import { CatalogScheduleEntry } from '../models/expense-catalog.model';
import {
  EXPENSE_CATALOG_CATEGORIES,
  ExpenseCatalogItem,
  ExpenseCatalogType,
} from '../models/expense-catalog.model';
import { MoneyPipe } from '../pipes/money.pipe';
import { AuthService } from '../services/auth.service';
import { CategoryService } from '../services/category.service';
import { ExpenseCatalogService } from '../services/expense-catalog.service';
import { UserPreferencesService } from '../services/user-preferences.service';

@Component({
  selector: 'app-expense-catalog-page',
  imports: [AsyncPipe, DatePipe, ReactiveFormsModule, MoneyPipe],
  templateUrl: './expense-catalog-page.component.html',
  styleUrl: './expense-catalog-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseCatalogPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly categoryService = inject(CategoryService);
  private readonly catalogService = inject(ExpenseCatalogService);
  protected readonly preferencesService = inject(UserPreferencesService);

  protected readonly types = EXPENSE_CATALOG_CATEGORIES;
  protected readonly fallbackCategories = DEFAULT_EXPENSE_CATEGORIES;
  protected readonly iconPresets = CATEGORY_ICON_PRESETS;
  protected readonly dayOptions = Array.from({ length: 31 }, (_, index) => index + 1);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly scheduleItems = signal<CatalogScheduleEntry[]>([]);
  protected readonly scheduleModalOpen = signal(false);
  protected readonly editingScheduleDay = signal<number | null>(null);
  protected readonly isEditing = signal(false);
  protected readonly editingItemId = signal<string | null>(null);
  protected readonly selectedType = signal<ExpenseCatalogType>('Eventual');

  protected readonly scheduleForm = this.fb.nonNullable.group({
    day: [1, [Validators.required, Validators.min(1), Validators.max(31)]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
  });

  protected readonly catalogForm = this.fb.nonNullable.group({
    type: ['Eventual' as ExpenseCatalogType, [Validators.required]],
    category: [DEFAULT_EXPENSE_CATEGORIES[0], [Validators.required]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    color: ['#76b4ff', [Validators.required]],
    icon: ['🧾', [Validators.required, Validators.maxLength(4)]],
    initialDebt: [0, [Validators.min(0)]],
    isIndefinite: [true, [Validators.required]],
    endDate: ['', []],
  });

  protected readonly user$ = this.authService.user$;
  protected readonly expenseCategories$ = this.user$.pipe(
    switchMap((user): Observable<string[]> => {
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

  protected readonly catalogItems$ = this.user$.pipe(
    switchMap((user): Observable<ExpenseCatalogItem[]> => {
      if (!user) {
        return EMPTY;
      }

      return this.catalogService.itemsForUser(user.uid);
    }),
  );

  protected readonly groupedItems$ = this.catalogItems$.pipe(
    map((items) => {
      const grouped = new Map<ExpenseCatalogType, ExpenseCatalogItem[]>();

      for (const item of items) {
        const current = grouped.get(item.type) ?? [];
        current.push(item);
        grouped.set(item.type, current);
      }

      return Array.from(grouped.entries())
        .map(([category, categoryItems]) => ({
          category,
          items: [...categoryItems].sort((left, right) => left.name.localeCompare(right.name)),
        }))
        .sort((left, right) => this.types.indexOf(left.category) - this.types.indexOf(right.category));
    }),
  );

  protected readonly canConfigureDates = computed(() => {
    const type = this.selectedType();
    return type === 'Recurrente' || type === 'Deuda';
  });
  protected readonly debtProjection = computed(() => {
    if (this.selectedType() !== 'Deuda') {
      return null;
    }

    const totalDebt = Number(this.catalogForm.controls.initialDebt.value || 0);
    const projection = this.projectDebtPlan(totalDebt, this.scheduleItems());
    if (!projection) {
      return null;
    }

    return {
      monthlyTotal: projection.monthlyTotal,
      estimatedInstallments: projection.paymentCount,
      estimatedMonths: projection.monthCount,
      completionDate: projection.completionDate,
    };
  });
  protected readonly debtCompletionDate = computed(() => {
    const type = this.normalizeType(this.catalogForm.controls.type.value);
    if (type !== 'Deuda') {
      return '';
    }

    return this.debtProjection()?.completionDate ?? '';
  });

  protected async saveCatalogItem(): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user || this.catalogForm.invalid) {
      this.catalogForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    try {
      const form = this.catalogForm.getRawValue();
      const schedules = this.scheduleItems();
      const completionDate =
        form.type === 'Deuda'
          ? this.projectDebtPlan(Number(form.initialDebt || 0), schedules)?.completionDate ?? ''
          : '';

      if ((form.type === 'Recurrente' || form.type === 'Deuda') && !schedules.length) {
        this.errorMessage.set('Agrega al menos una fecha de pago.');
        return;
      }

      if (form.type === 'Deuda' && Number(form.initialDebt || 0) <= 0) {
        this.errorMessage.set('Para Deuda, el monto inicial debe ser mayor que cero.');
        return;
      }

      if (!form.isIndefinite && !form.endDate && form.type !== 'Deuda') {
        this.errorMessage.set('Define fecha de fin o marca indefinido.');
        return;
      }

      if (form.type === 'Deuda' && !completionDate) {
        this.errorMessage.set('No fue posible calcular la fecha de finalizacion. Revisa monto y fechas.');
        return;
      }

      const payload = {
        type: form.type,
        category: form.category,
        name: form.name,
        color: form.color,
        icon: form.icon,
        initialDebt: form.type === 'Deuda' ? Number(form.initialDebt || 0) : null,
        debtPaymentMode: form.type === 'Deuda' ? ('Recurrente' as const) : null,
        paymentSchedules: schedules,
        endDate: form.type === 'Deuda' ? completionDate : form.isIndefinite ? null : form.endDate,
        isIndefinite: form.type === 'Deuda' ? false : form.isIndefinite,
      };

      const editingItemId = this.editingItemId();
      if (editingItemId) {
        await this.catalogService.updateItem(user.uid, editingItemId, payload);
      } else {
        await this.catalogService.addItem(user.uid, payload);
      }

      this.resetForm();
    } catch {
      this.errorMessage.set('No fue posible guardar el item del catalogo.');
    } finally {
      this.saving.set(false);
    }
  }

  protected startEdit(item: ExpenseCatalogItem): void {
    this.editingItemId.set(item.id);
    this.isEditing.set(true);
    this.errorMessage.set('');

    this.scheduleItems.set(item.paymentSchedules ? [...item.paymentSchedules] : []);

    this.catalogForm.patchValue({
      type: item.type,
      category: item.category,
      name: item.name,
      color: item.color,
      icon: item.icon,
      initialDebt: Number(item.initialDebt || 0),
      isIndefinite: item.type === 'Deuda' ? false : item.isIndefinite,
      endDate: item.endDate ?? '',
    });
    this.selectedType.set(item.type);
    this.onTypeChange();
  }

  protected async deleteItem(item: ExpenseCatalogItem): Promise<void> {
    if (this.saving()) {
      return;
    }

    const accepted =
      typeof window !== 'undefined' && window.confirm(`Se eliminara "${item.name}" del catalogo. Deseas continuar?`);
    if (!accepted) {
      return;
    }

    const user = await this.getCurrentUser();
    if (!user) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    try {
      await this.catalogService.deleteItem(user.uid, item.id);
      if (this.editingItemId() === item.id) {
        this.resetForm();
      }
    } catch {
      this.errorMessage.set('No fue posible eliminar el item del catalogo.');
    } finally {
      this.saving.set(false);
    }
  }

  protected cancelEdit(): void {
    this.resetForm();
  }

  private resetForm(): void {
    this.catalogForm.patchValue({
      type: 'Eventual',
      category: DEFAULT_EXPENSE_CATEGORIES[0],
      name: '',
      color: '#76b4ff',
      icon: '🧾',
      initialDebt: 0,
      isIndefinite: true,
      endDate: '',
    });
    this.scheduleItems.set([]);
    this.scheduleForm.patchValue({ day: 1, amount: 0 });
    this.scheduleModalOpen.set(false);
    this.editingScheduleDay.set(null);
    this.selectedType.set('Eventual');
    this.isEditing.set(false);
    this.editingItemId.set(null);
  }

  protected selectIcon(icon: string): void {
    this.catalogForm.patchValue({ icon });
  }

  protected openScheduleModal(): void {
    if (!this.canConfigureDates()) {
      return;
    }

    this.errorMessage.set('');
    this.editingScheduleDay.set(null);
    this.scheduleForm.patchValue({ day: 1, amount: 0 });
    this.scheduleModalOpen.set(true);
  }

  protected closeScheduleModal(): void {
    this.syncDebtCompletionDateInForm();
    this.editingScheduleDay.set(null);
    this.scheduleModalOpen.set(false);
  }

  protected beginEditScheduleRow(row: CatalogScheduleEntry): void {
    this.editingScheduleDay.set(row.day);
    this.scheduleForm.patchValue({ day: row.day, amount: row.amount });
    this.errorMessage.set('');
  }

  protected cancelScheduleEdit(): void {
    this.editingScheduleDay.set(null);
    this.scheduleForm.patchValue({ day: 1, amount: 0 });
  }

  protected addScheduleRow(): void {
    const type = this.catalogForm.controls.type.value;
    const values = this.scheduleForm.getRawValue();
    const day = Number(values.day || 0);
    const amount = Number(values.amount || 0);
    const editingDay = this.editingScheduleDay();
    if (this.scheduleForm.invalid || !Number.isInteger(day) || day < 1 || day > 31 || !Number.isFinite(amount) || amount <= 0) {
      this.scheduleForm.markAllAsTouched();
      this.errorMessage.set('Selecciona dia valido y monto mayor que cero.');
      return;
    }

    const rows = [...this.scheduleItems()];
    const idx = rows.findIndex((row) => row.day === day);

    if (type === 'Eventual' && rows.length >= 1 && idx < 0) {
      const previousIdx = editingDay !== null ? rows.findIndex((row) => row.day === editingDay) : 0;
      const replaceIdx = previousIdx >= 0 ? previousIdx : 0;
      rows[replaceIdx] = { day, amount };
    } else if (idx >= 0) {
      rows[idx] = { day, amount };
    } else {
      rows.push({ day, amount });
    }

    rows.sort((a, b) => a.day - b.day);
    this.scheduleItems.set(rows);
    this.editingScheduleDay.set(null);
    this.scheduleForm.patchValue({ day: 1, amount: 0 });
    this.errorMessage.set('');
  }

  protected removeScheduleRow(day: number): void {
    this.scheduleItems.set(this.scheduleItems().filter((row) => row.day !== day));
    if (this.editingScheduleDay() === day) {
      this.cancelScheduleEdit();
    }
  }

  protected onTypeChange(): void {
    const type = this.normalizeType(this.catalogForm.controls.type.value);
    this.selectedType.set(type);

    if (this.catalogForm.controls.type.value !== type) {
      this.catalogForm.patchValue({ type });
    }

    if (type === 'Eventual') {
      this.scheduleItems.set([]);
      this.catalogForm.patchValue({
        initialDebt: 0,
        isIndefinite: true,
        endDate: '',
      });
    }

    if (type === 'Deuda') {
      this.catalogForm.patchValue({ isIndefinite: false });
      this.syncDebtCompletionDateInForm();
    }

    if (type === 'Eventual' && this.scheduleItems().length > 1) {
      this.scheduleItems.set([this.scheduleItems()[0]]);
    }

    if (type === 'Eventual') {
      this.scheduleModalOpen.set(false);
      this.editingScheduleDay.set(null);
    }
  }

  private getCurrentUser(): Promise<{ uid: string } | null> {
    return firstValueFrom(this.user$).then((user) => (user ? { uid: user.uid } : null));
  }

  private normalizeType(value: unknown): ExpenseCatalogType {
    if (value === 'Recurrente' || value === 'Deuda' || value === 'Eventual') {
      return value;
    }

    return 'Eventual';
  }

  private syncDebtCompletionDateInForm(): void {
    const type = this.normalizeType(this.catalogForm.controls.type.value);
    if (type !== 'Deuda') {
      return;
    }

    const completionDate = this.debtCompletionDate();
    this.catalogForm.patchValue({ endDate: completionDate || '' });
  }

  private projectDebtPlan(totalDebt: number, schedules: CatalogScheduleEntry[]): {
    monthlyTotal: number;
    completionDate: string;
    paymentCount: number;
    monthCount: number;
  } | null {
    if (!Number.isFinite(totalDebt) || totalDebt <= 0) {
      return null;
    }

    const uniqueSchedules = [...schedules]
      .filter((entry) => Number.isInteger(entry.day) && entry.day >= 1 && entry.day <= 31 && Number(entry.amount || 0) > 0)
      .sort((left, right) => left.day - right.day);

    if (!uniqueSchedules.length) {
      return null;
    }

    const monthlyTotal = uniqueSchedules.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    if (!Number.isFinite(monthlyTotal) || monthlyTotal <= 0) {
      return null;
    }

    const estimatedMonths = Math.ceil(totalDebt / monthlyTotal);
    const maxCycles = Math.min(12000, Math.max(36, estimatedMonths + 24));

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let remaining = totalDebt;
    let currentYear = start.getFullYear();
    let currentMonth = start.getMonth();
    let paymentCount = 0;
    const months = new Set<string>();

    for (let cycle = 0; cycle < maxCycles; cycle += 1) {
      for (const schedule of uniqueSchedules) {
        const monthLastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
        const dueDay = Math.min(schedule.day, monthLastDay);
        const dueDate = new Date(currentYear, currentMonth, dueDay);

        if (dueDate < start) {
          continue;
        }

        remaining -= Number(schedule.amount || 0);
        paymentCount += 1;
        months.add(`${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`);

        if (remaining <= 0) {
          return {
            monthlyTotal,
            completionDate: dueDate.toISOString().slice(0, 10),
            paymentCount,
            monthCount: months.size,
          };
        }
      }

      currentMonth += 1;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear += 1;
      }
    }

    return null;
  }
}
