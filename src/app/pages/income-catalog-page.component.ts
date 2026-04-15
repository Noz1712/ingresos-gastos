import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EMPTY, firstValueFrom, map, Observable, switchMap } from 'rxjs';
import { DateInputComponent } from '../components/date-input.component';
import { CATEGORY_ICON_PRESETS } from '../models/category-icon-presets.model';
import { CatalogScheduleEntry } from '../models/expense-catalog.model';
import { DEFAULT_INCOME_CATEGORIES } from '../models/income.model';
import {
  INCOME_CATALOG_TYPES,
  IncomeCatalogItem,
  IncomeCatalogType,
} from '../models/income-catalog.model';
import { MoneyPipe } from '../pipes/money.pipe';
import { AuthService } from '../services/auth.service';
import { CategoryService } from '../services/category.service';
import { IncomeCatalogService } from '../services/income-catalog.service';
import { UserPreferencesService } from '../services/user-preferences.service';

@Component({
  selector: 'app-income-catalog-page',
  imports: [AsyncPipe, ReactiveFormsModule, MoneyPipe, DateInputComponent],
  templateUrl: './income-catalog-page.component.html',
  styleUrl: './income-catalog-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomeCatalogPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly categoryService = inject(CategoryService);
  private readonly incomeCatalogService = inject(IncomeCatalogService);
  protected readonly preferencesService = inject(UserPreferencesService);

  protected readonly types = INCOME_CATALOG_TYPES;
  protected readonly fallbackCategories = DEFAULT_INCOME_CATEGORIES;
  protected readonly iconPresets = CATEGORY_ICON_PRESETS;
  protected readonly dayOptions = Array.from({ length: 31 }, (_, index) => index + 1);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly scheduleItems = signal<CatalogScheduleEntry[]>([]);
  protected readonly scheduleModalOpen = signal(false);
  protected readonly editingScheduleDay = signal<number | null>(null);
  protected readonly isEditing = signal(false);
  protected readonly editingItemId = signal<string | null>(null);
  protected readonly selectedType = signal<IncomeCatalogType>('Eventual');

  protected readonly scheduleForm = this.fb.nonNullable.group({
    day: [1, [Validators.required, Validators.min(1), Validators.max(31)]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
  });

  protected readonly catalogForm = this.fb.nonNullable.group({
    type: ['Eventual' as IncomeCatalogType, [Validators.required]],
    category: [DEFAULT_INCOME_CATEGORIES[0], [Validators.required]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    color: ['#76b4ff', [Validators.required]],
    icon: ['💰', [Validators.required, Validators.maxLength(4)]],
    isIndefinite: [true, [Validators.required]],
    endDate: ['', []],
  });

  protected readonly canConfigureDates = computed(() => this.selectedType() === 'Recurrente');

  protected readonly user$ = this.authService.user$;
  protected readonly incomeCategories$ = this.user$.pipe(
    switchMap((user): Observable<string[]> => {
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

  protected readonly groupedItems$ = this.user$.pipe(
    switchMap((user): Observable<Array<{ type: IncomeCatalogType; items: IncomeCatalogItem[] }>> => {
      if (!user) {
        return EMPTY;
      }

      return this.incomeCatalogService.itemsForUser(user.uid).pipe(
        map((items) => {
          const grouped = new Map<IncomeCatalogType, IncomeCatalogItem[]>();
          for (const item of items) {
            const current = grouped.get(item.type) ?? [];
            current.push(item);
            grouped.set(item.type, current);
          }

          return Array.from(grouped.entries())
            .map(([type, groupItems]) => ({
              type,
              items: [...groupItems].sort((left, right) => left.name.localeCompare(right.name)),
            }))
            .sort((left, right) => this.types.indexOf(left.type) - this.types.indexOf(right.type));
        }),
      );
    }),
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
      const schedules = this.scheduleItems();

      if (form.type === 'Recurrente' && !schedules.length) {
        this.errorMessage.set('Agrega al menos una fecha de ingreso recurrente.');
        return;
      }

      if (!form.isIndefinite && !form.endDate) {
        this.errorMessage.set('Define fecha de fin o marca indefinido.');
        return;
      }

      const payload = {
        type: form.type,
        category: form.category,
        name: form.name,
        fixedAmount: schedules.length ? Number(schedules[0].amount || 0) : 0,
        color: form.color,
        icon: form.icon,
        paymentSchedules: form.type === 'Eventual' ? [] : schedules,
        endDate: form.isIndefinite ? null : form.endDate,
        isIndefinite: form.isIndefinite,
      };

      const editingItemId = this.editingItemId();
      if (editingItemId) {
        await this.incomeCatalogService.updateItem(user.uid, editingItemId, payload);
      } else {
        await this.incomeCatalogService.addItem(user.uid, payload);
      }

      this.resetForm();
    } catch {
      this.errorMessage.set('No fue posible guardar el item del catalogo de ingresos.');
    } finally {
      this.saving.set(false);
    }
  }

  protected startEdit(item: IncomeCatalogItem): void {
    this.editingItemId.set(item.id);
    this.isEditing.set(true);
    this.errorMessage.set('');

    const itemSchedules = item.paymentSchedules?.length
      ? [...item.paymentSchedules]
      : item.type === 'Recurrente' && Number(item.fixedAmount || 0) > 0
        ? [{ day: 1, amount: Number(item.fixedAmount || 0) }]
        : [];

    this.scheduleItems.set(itemSchedules);

    this.catalogForm.patchValue({
      type: item.type,
      category: item.category,
      name: item.name,
      color: item.color,
      icon: item.icon,
      isIndefinite: item.isIndefinite,
      endDate: item.endDate ?? '',
    });
    this.selectedType.set(item.type);
    this.onTypeChange();
  }

  protected async deleteItem(item: IncomeCatalogItem): Promise<void> {
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
      await this.incomeCatalogService.deleteItem(user.uid, item.id);
      if (this.editingItemId() === item.id) {
        this.resetForm();
      }
    } catch {
      this.errorMessage.set('No fue posible eliminar el item del catalogo de ingresos.');
    } finally {
      this.saving.set(false);
    }
  }

  protected cancelEdit(): void {
    this.resetForm();
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
    const values = this.scheduleForm.getRawValue();
    const day = Number(values.day || 0);
    const amount = Number(values.amount || 0);
    if (
      this.scheduleForm.invalid ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31 ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      this.scheduleForm.markAllAsTouched();
      this.errorMessage.set('Selecciona dia valido y monto mayor que cero.');
      return;
    }

    const rows = [...this.scheduleItems()];
    const idx = rows.findIndex((row) => row.day === day);
    if (idx >= 0) {
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
      this.catalogForm.patchValue({ isIndefinite: true, endDate: '' });
      this.scheduleModalOpen.set(false);
      this.editingScheduleDay.set(null);
    }
  }

  private resetForm(): void {
    this.catalogForm.patchValue({
      type: 'Eventual',
      category: DEFAULT_INCOME_CATEGORIES[0],
      name: '',
      color: '#76b4ff',
      icon: '💰',
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

  private getCurrentUser(): Promise<{ uid: string } | null> {
    return firstValueFrom(this.user$).then((user) => (user ? { uid: user.uid } : null));
  }

  private normalizeType(value: unknown): IncomeCatalogType {
    if (value === 'Recurrente' || value === 'Eventual') {
      return value;
    }

    return 'Eventual';
  }
}
