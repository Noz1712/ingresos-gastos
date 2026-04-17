import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  template: `
    @if (notificationService.items().length) {
      <aside class="notifications" aria-live="polite" aria-atomic="false">
        @for (item of notificationService.items(); track item.id) {
          <article class="toast" [class.success]="item.type === 'success'" [class.error]="item.type === 'error'" [class.warning]="item.type === 'warning'">
            <p>{{ item.message }}</p>
            <button type="button" aria-label="Cerrar notificacion" (click)="notificationService.dismiss(item.id)">×</button>
          </article>
        }
      </aside>
    }
  `,
  styles: `
    .notifications {
      position: fixed;
      right: 1rem;
      top: 1rem;
      z-index: 1100;
      display: grid;
      gap: 0.55rem;
      width: min(24rem, calc(100vw - 2rem));
    }

    .toast {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      border-radius: 0.9rem;
      border: 1px solid transparent;
      padding: 0.7rem 0.85rem;
      box-shadow: 0 10px 22px rgba(81, 112, 146, 0.18);
      backdrop-filter: blur(8px);
      animation: slide-in 180ms ease;
    }

    .toast.success {
      background: #e8f7ee;
      border-color: #b7e4c5;
      color: #2f7f59;
    }

    .toast.error {
      background: #fdeef1;
      border-color: #f3c0cb;
      color: #a24a68;
    }

    .toast.warning {
      background: #fff6df;
      border-color: #f0db99;
      color: #8c6a0a;
    }

    .toast p {
      margin: 0;
      line-height: 1.3;
      font-weight: 600;
    }

    .toast button {
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
      padding: 0.1rem 0.2rem;
      opacity: 0.75;
    }

    .toast button:hover {
      opacity: 1;
    }

    @keyframes slide-in {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 640px) {
      .notifications {
        right: 0.75rem;
        left: 0.75rem;
        top: 0.75rem;
        width: auto;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent {
  protected readonly notificationService = inject(NotificationService);
}
