import { computed, inject, Injectable, signal } from '@angular/core';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { FIREBASE_FIRESTORE } from '../firebase.tokens';
import { CURRENCY_CATALOG, DEFAULT_CURRENCY, getCurrencyOption } from '../models/currency.model';
import { UserPreferences } from '../models/user-preferences.model';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class UserPreferencesService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private unsubscribePreferences: (() => void) | null = null;

  readonly preferences = signal<UserPreferences | null>(null);
  readonly hasConfiguredCurrency = computed(() => !!this.preferences()?.currencyCode);
  readonly currencyCode = computed(() => this.preferences()?.currencyCode ?? DEFAULT_CURRENCY.code);
  readonly currency = computed(() => getCurrencyOption(this.currencyCode()));
  readonly currentCash = computed(() => this.preferences()?.currentCash ?? null);
  readonly cashBaselineDate = computed(() => this.preferences()?.cashBaselineDate ?? null);
  readonly dueObligationsFilterPreset = computed(
    () => this.preferences()?.dueObligationsFilterPreset ?? 'upcoming30Days',
  );

  constructor() {
    this.authService.user$.subscribe((user) => {
      this.unsubscribePreferences?.();

      if (!user) {
        this.preferences.set(null);
        this.unsubscribePreferences = null;
        return;
      }

      const preferencesRef = doc(this.firestore, `users/${user.uid}/settings/preferences`);
      const userDocRef = doc(this.firestore, `users/${user.uid}`);

      this.unsubscribePreferences = onSnapshot(preferencesRef, async (snapshot) => {
        if (!snapshot.exists()) {
          const legacySnapshot = await getDoc(userDocRef).catch(() => null);

          if (!legacySnapshot?.exists()) {
            this.preferences.set({
              currencyCode: DEFAULT_CURRENCY.code,
              currentCash: null,
              cashBaselineDate: null,
              dueObligationsFilterPreset: 'upcoming30Days',
            });
            return;
          }

          const legacyData = legacySnapshot.data() as Partial<UserPreferences> & {
            currency?: unknown;
            code?: unknown;
            currency_code?: unknown;
            current_cash?: unknown;
            cash_baseline_date?: unknown;
            due_obligations_filter_preset?: unknown;
          };
          const resolved = this.resolvePreferences(legacyData);

          this.preferences.set(resolved);
          await setDoc(
            preferencesRef,
            {
              currencyCode: resolved.currencyCode,
              currentCash: resolved.currentCash,
              cashBaselineDate: resolved.cashBaselineDate,
              dueObligationsFilterPreset: resolved.dueObligationsFilterPreset,
            },
            { merge: true },
          ).catch(() => undefined);
          return;
        }

        const data = snapshot.data() as Partial<UserPreferences> & {
          currency?: unknown;
          code?: unknown;
          currency_code?: unknown;
          current_cash?: unknown;
          cash_baseline_date?: unknown;
          due_obligations_filter_preset?: unknown;
        };

        this.preferences.set(this.resolvePreferences(data));
      });
    });
  }

  async saveCurrency(currencyCode: string): Promise<void> {
    const user = await this.authService.currentUser();
    if (!user) {
      this.notifications.warning('Inicia sesion para guardar preferencias.');
      return;
    }

    const preferencesRef = doc(this.firestore, `users/${user.uid}/settings/preferences`);
    const normalizedCurrency = this.normalizeCurrencyCode(currencyCode);
    this.preferences.set({
      currencyCode: normalizedCurrency,
      currentCash: this.currentCash(),
      cashBaselineDate: this.cashBaselineDate(),
      dueObligationsFilterPreset: this.dueObligationsFilterPreset(),
    });
    try {
      await setDoc(preferencesRef, { currencyCode: normalizedCurrency }, { merge: true });
      this.notifications.success('Moneda guardada correctamente.');
    } catch (error) {
      this.notifications.error('No se pudo guardar la moneda.');
      throw error;
    }
  }

  async saveCurrentCashSnapshot(currentCash: number, baselineDate?: string): Promise<void> {
    const user = await this.authService.currentUser();
    if (!user) {
      this.notifications.warning('Inicia sesion para guardar el efectivo actual.');
      return;
    }

    const normalizedCash = this.normalizeCurrentCash(currentCash);
    const normalizedBaselineDate = this.normalizeBaselineDate(baselineDate ?? new Date().toISOString().slice(0, 10));
    const next = {
      currencyCode: this.currencyCode(),
      currentCash: normalizedCash,
      cashBaselineDate: normalizedBaselineDate,
      dueObligationsFilterPreset: this.dueObligationsFilterPreset(),
    } satisfies UserPreferences;

    this.preferences.set(next);

    const preferencesRef = doc(this.firestore, `users/${user.uid}/settings/preferences`);
    try {
      await setDoc(
        preferencesRef,
        {
          currentCash: next.currentCash,
          cashBaselineDate: next.cashBaselineDate,
        },
        { merge: true },
      );
      this.notifications.success('Efectivo actual guardado correctamente.');
    } catch (error) {
      this.notifications.error('No se pudo guardar el efectivo actual.');
      throw error;
    }
  }

  async saveDueObligationsFilterPreset(preset: unknown): Promise<void> {
    const user = await this.authService.currentUser();
    if (!user) {
      this.notifications.warning('Inicia sesion para guardar el filtro de periodo.');
      return;
    }

    const normalizedPreset = this.normalizeDueObligationsFilterPreset(preset);
    this.preferences.set({
      currencyCode: this.currencyCode(),
      currentCash: this.currentCash(),
      cashBaselineDate: this.cashBaselineDate(),
      dueObligationsFilterPreset: normalizedPreset,
    });

    const preferencesRef = doc(this.firestore, `users/${user.uid}/settings/preferences`);
    try {
      await setDoc(
        preferencesRef,
        {
          dueObligationsFilterPreset: normalizedPreset,
        },
        { merge: true },
      );
    } catch (error) {
      this.notifications.error('No se pudo guardar el filtro de periodo.');
      throw error;
    }
  }

  private resolvePreferences(
    data: Partial<UserPreferences> & {
      currency?: unknown;
      code?: unknown;
      currency_code?: unknown;
      current_cash?: unknown;
      cash_baseline_date?: unknown;
      due_obligations_filter_preset?: unknown;
    },
  ): UserPreferences {
    return {
      currencyCode: this.resolveCurrencyCode(data),
      currentCash: this.normalizeCurrentCash(data.currentCash ?? data.current_cash),
      cashBaselineDate: this.normalizeBaselineDate(data.cashBaselineDate ?? data.cash_baseline_date),
      dueObligationsFilterPreset: this.normalizeDueObligationsFilterPreset(
        data.dueObligationsFilterPreset ?? data.due_obligations_filter_preset,
      ),
    };
  }

  private resolveCurrencyCode(
    data: Partial<UserPreferences> & { currency?: unknown; code?: unknown; currency_code?: unknown },
  ): string {
    return this.normalizeCurrencyCode(data.currencyCode ?? data.currency ?? data.code ?? data.currency_code);
  }

  private normalizeCurrencyCode(rawCode: unknown): string {
    const parsed = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    const isValid = CURRENCY_CATALOG.some((currency) => currency.code === parsed);
    return isValid ? parsed : DEFAULT_CURRENCY.code;
  }

  private normalizeCurrentCash(rawValue: unknown): number | null {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
  }

  private normalizeBaselineDate(rawValue: unknown): string | null {
    const parsed = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
      return null;
    }

    return parsed;
  }

  private normalizeDueObligationsFilterPreset(
    rawPreset: unknown,
  ): 'upcoming30Days' | 'upcoming15Days' | 'currentMonth' | 'currentFortnight' {
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
}
