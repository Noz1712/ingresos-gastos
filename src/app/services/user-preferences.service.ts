import { computed, inject, Injectable, signal } from '@angular/core';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { FIREBASE_FIRESTORE } from '../firebase.tokens';
import { getCurrencyOption } from '../models/currency.model';
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
  readonly currencyCode = computed(() => this.preferences()?.currencyCode ?? getCurrencyOption().code);
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
      this.unsubscribePreferences = onSnapshot(preferencesRef, (snapshot) => {
        if (!snapshot.exists()) {
          this.preferences.set(null);
          return;
        }

        const data = snapshot.data() as Partial<UserPreferences>;
        this.preferences.set({
          currencyCode: data.currencyCode ?? getCurrencyOption().code,
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
    await setDoc(preferencesRef, { currencyCode }, { merge: true });
  }
}
