import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { CURRENCY_CATALOG } from '../models/currency.model';
import { AppResetService } from '../services/app-reset.service';
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
  private readonly authService = inject(AuthService);
  private readonly appResetService = inject(AppResetService);

  protected readonly user$ = this.authService.user$;
  protected readonly preferencesService = inject(UserPreferencesService);
  protected readonly currencies = CURRENCY_CATALOG;
  protected readonly selectedCurrencyCode = signal(this.preferencesService.currencyCode());
  protected readonly resetInProgress = signal(false);
  protected readonly resetErrorMessage = signal('');
  protected readonly resetSuccessMessage = signal('');

  constructor() {
    effect(() => {
      this.selectedCurrencyCode.set(this.preferencesService.currencyCode());
    });
  }

  protected async saveCurrency(): Promise<void> {
    await this.preferencesService.saveCurrency(this.selectedCurrencyCode());
  }

  protected async resetAppData(): Promise<void> {
    if (this.resetInProgress()) {
      return;
    }

    const accepted =
      typeof window !== 'undefined' &&
      window.confirm(
        'Se borraran todos tus ingresos, gastos, catalogos, pendientes y configuracion. Esta accion no se puede deshacer. Deseas continuar?',
      );

    if (!accepted) {
      return;
    }

    const confirmationCode = typeof window !== 'undefined' ? window.prompt('Escribe REINICIAR para confirmar:') : null;
    if (confirmationCode !== 'REINICIAR') {
      this.resetErrorMessage.set('Reinicio cancelado. Debes escribir REINICIAR exactamente para confirmar.');
      this.resetSuccessMessage.set('');
      return;
    }

    this.resetInProgress.set(true);
    this.resetErrorMessage.set('');
    this.resetSuccessMessage.set('');

    try {
      await this.appResetService.resetCurrentUserData();
      this.resetSuccessMessage.set('Listo. Todos tus datos fueron borrados y la app esta reiniciada.');
    } catch {
      this.resetErrorMessage.set('No se pudo reiniciar la app. Intenta nuevamente.');
    } finally {
      this.resetInProgress.set(false);
    }
  }
}
