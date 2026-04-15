import { computed, inject, Injectable, signal } from '@angular/core';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { FIREBASE_FIRESTORE } from '../firebase.tokens';
import { CURRENCY_CATALOG, DEFAULT_CURRENCY, getCurrencyOption } from '../models/currency.model';
import { UserPreferences } from '../models/user-preferences.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class UserPreferencesService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private unsubscribePreferences: (() => void) | null = null;

  readonly preferences = signal<UserPreferences | null>(null);
  readonly hasConfiguredCurrency = computed(() => !!this.preferences()?.currencyCode);
  readonly currencyCode = computed(() => this.preferences()?.currencyCode ?? DEFAULT_CURRENCY.code);
  readonly currency = computed(() => getCurrencyOption(this.currencyCode()));

  constructor() {
    this.authService.user$.subscribe((user) => {
      this.unsubscribePreferences?.();

      if (!user) {
        this.preferences.set(null);
        this.unsubscribePreferences = null;
        return;
      }

      const preferencesRef = doc(this.firestore, `users/${user.uid}/settings/preferences`);
      const legacyPreferencesRef = doc(this.firestore, `users/${user.uid}/preferences`);

      this.unsubscribePreferences = onSnapshot(preferencesRef, async (snapshot) => {
        if (!snapshot.exists()) {
          const legacySnapshot = await getDoc(legacyPreferencesRef).catch(() => null);

          if (!legacySnapshot?.exists()) {
            this.preferences.set({ currencyCode: DEFAULT_CURRENCY.code });
            return;
          }

          const legacyData = legacySnapshot.data() as Partial<UserPreferences> & {
            currency?: unknown;
            code?: unknown;
            currency_code?: unknown;
          };
          const legacyCurrency = this.resolveCurrencyCode(legacyData);

          this.preferences.set({ currencyCode: legacyCurrency });
          await setDoc(preferencesRef, { currencyCode: legacyCurrency }, { merge: true }).catch(() => undefined);
          return;
        }

        const data = snapshot.data() as Partial<UserPreferences> & {
          currency?: unknown;
          code?: unknown;
          currency_code?: unknown;
        };

        const currencyCode = this.resolveCurrencyCode(data);
        this.preferences.set({
          currencyCode,
        });
      });
    });
  }

  async saveCurrency(currencyCode: string): Promise<void> {
    const user = await this.authService.currentUser();
    if (!user) {
      return;
    }

    const preferencesRef = doc(this.firestore, `users/${user.uid}/settings/preferences`);
    const legacyPreferencesRef = doc(this.firestore, `users/${user.uid}/preferences`);
    const normalizedCurrency = this.normalizeCurrencyCode(currencyCode);
    this.preferences.set({ currencyCode: normalizedCurrency });
    await Promise.all([
      setDoc(preferencesRef, { currencyCode: normalizedCurrency }, { merge: true }),
      setDoc(legacyPreferencesRef, { currencyCode: normalizedCurrency }, { merge: true }),
    ]);
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
}
