import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EMPTY, firstValueFrom, map, Observable, switchMap } from 'rxjs';
import { CATEGORY_ICON_PRESETS } from '../models/category-icon-presets.model';
import { DEFAULT_EXPENSE_CATEGORIES } from '../models/expense.model';
import { CatalogScheduleEntry } from '../models/expense-catalog.model';
import {
  DebtPaymentMode,
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
  imports: [AsyncPipe, ReactiveFormsModule, MoneyPipe],
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
  protected readonly debtPaymentModes: DebtPaymentMode[] = ['Recurrente', 'PagoUnico'];
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
    debtPaymentMode: ['Recurrente' as DebtPaymentMode, [Validators.required]],
    singlePaymentDate: ['', []],
    singlePaymentAmount: [0, [Validators.min(0)]],
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

      void this.catalogService.ensureDefaultsForUser(user.uid);
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

  protected readonly totalLabel = computed(() => this.catalogForm.controls.name.value.trim().length);
  protected readonly canConfigureDates = computed(() => {
    const type = this.selectedType();
    return type === 'Recurrente' || (type === 'Deuda' && this.selectedDebtPaymentMode() === 'Recurrente');
  });
  protected readonly selectedDebtPaymentMode = computed(() => this.normalizeDebtPaymentMode(this.catalogForm.controls.debtPaymentMode.value));
  protected readonly isDebtSinglePayment = computed(
    () => this.selectedType() === 'Deuda' && this.selectedDebtPaymentMode() === 'PagoUnico',
  );

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
      const debtMode = this.normalizeDebtPaymentMode(form.debtPaymentMode);
      let schedules = this.scheduleItems();

      if (form.type === 'Deuda' && debtMode === 'PagoUnico') {
        const singleDate = form.singlePaymentDate;
        const singleAmount = Number(form.singlePaymentAmount || 0);
        if (!singleDate || !Number.isFinite(singleAmount) || singleAmount <= 0) {
          this.errorMessage.set('Para Deuda de pago unico debes definir fecha y monto.');
          return;
        }

        const day = new Date(`${singleDate}T00:00:00`).getDate();
        schedules = [{ day, amount: singleAmount }];
      }

      if ((form.type === 'Recurrente' || form.type === 'Deuda') && !schedules.length) {
        this.errorMessage.set('Agrega al menos una fecha de pago recurrente.');
        return;
      }

      if (form.type === 'Deuda' && Number(form.initialDebt || 0) <= 0) {
        this.errorMessage.set('Para Deuda, el monto inicial debe ser mayor que cero.');
        return;
      }

      if (!form.isIndefinite && !form.endDate && !(form.type === 'Deuda' && debtMode === 'PagoUnico')) {
        this.errorMessage.set('Define fecha de fin o marca indefinido.');
        return;
      }

      const payload = {
        type: form.type,
        category: form.category,
        name: form.name,
        color: form.color,
        icon: form.icon,
        initialDebt: form.type === 'Deuda' ? Number(form.initialDebt || 0) : null,
        debtPaymentMode: form.type === 'Deuda' ? debtMode : null,
        paymentSchedules: schedules,
        endDate:
          form.type === 'Deuda' && debtMode === 'PagoUnico'
            ? form.singlePaymentDate
            : form.isIndefinite
              ? null
              : form.endDate,
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
      debtPaymentMode:
        item.type === 'Deuda'
          ? item.debtPaymentMode ?? ((item.paymentSchedules?.length || 0) > 1 ? 'Recurrente' : 'PagoUnico')
          : 'Recurrente',
      singlePaymentDate: item.type === 'Deuda' && item.endDate ? item.endDate : '',
      singlePaymentAmount:
        item.type === 'Deuda' && (item.debtPaymentMode ?? ((item.paymentSchedules?.length || 0) > 1 ? 'Recurrente' : 'PagoUnico')) === 'PagoUnico'
          ? Number(item.paymentSchedules?.[0]?.amount || 0)
          : 0,
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
      debtPaymentMode: 'Recurrente',
      singlePaymentDate: '',
      singlePaymentAmount: 0,
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

    if (type !== 'Recurrente' && rows.length >= 1 && idx < 0) {
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
    const debtMode = this.normalizeDebtPaymentMode(this.catalogForm.controls.debtPaymentMode.value);

    if (this.catalogForm.controls.type.value !== type) {
      this.catalogForm.patchValue({ type });
    }

    if (type === 'Eventual') {
      this.scheduleItems.set([]);
      this.catalogForm.patchValue({
        initialDebt: 0,
        debtPaymentMode: 'Recurrente',
        singlePaymentDate: '',
        singlePaymentAmount: 0,
        isIndefinite: true,
        endDate: '',
      });
    }

    if (type === 'Deuda') {
      this.catalogForm.patchValue({ isIndefinite: false });
      if (debtMode === 'PagoUnico') {
        this.scheduleItems.set([]);
        this.scheduleModalOpen.set(false);
        this.editingScheduleDay.set(null);
      }
    }

    if (type !== 'Recurrente' && this.scheduleItems().length > 1) {
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

  private normalizeDebtPaymentMode(value: unknown): DebtPaymentMode {
    if (value === 'Recurrente' || value === 'PagoUnico') {
      return value;
    }

    return 'Recurrente';
  }
}
