import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'warning';

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly itemsSignal = signal<AppNotification[]>([]);
  readonly items = this.itemsSignal.asReadonly();

  success(message: string): void {
    this.push('success', message);
  }

  error(message: string): void {
    this.push('error', message);
  }

  warning(message: string): void {
    this.push('warning', message);
  }

  dismiss(id: string): void {
    this.itemsSignal.update((items) => items.filter((item) => item.id !== id));
  }

  private push(type: NotificationType, message: string): void {
    const id = this.generateId();
    this.itemsSignal.update((items) => [...items, { id, type, message }]);

    const ttl = type === 'error' ? 6000 : 4200;
    setTimeout(() => {
      this.dismiss(id);
    }, ttl);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
