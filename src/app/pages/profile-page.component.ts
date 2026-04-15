import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { CURRENCY_CATALOG } from '../models/currency.model';
import { AuthService } from '../services/auth.service';
import { UserPreferencesService } from '../services/user-preferences.service';

@Component({
  selector: 'app-profile-page',
  imports: [AsyncPipe],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePageComponent {
  protected readonly user$ = inject(AuthService).user$;
  protected readonly preferencesService = inject(UserPreferencesService);
  protected readonly currencies = CURRENCY_CATALOG;
  protected readonly selectedCurrencyCode = signal(this.preferencesService.currencyCode());

  constructor() {
    effect(() => {
      this.selectedCurrencyCode.set(this.preferencesService.currencyCode());
    });
  }

  protected async saveCurrency(): Promise<void> {
    await this.preferencesService.saveCurrency(this.selectedCurrencyCode());
  }
}
