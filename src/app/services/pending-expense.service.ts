import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { FIREBASE_FIRESTORE } from '../firebase.tokens';
import {
  PendingExpense,
  PendingExpenseInput,
  PendingPaymentSchedule,
} from '../models/pending-expense.model';
import { NotificationService } from './notification.service';

type PendingExpenseDocument = Omit<PendingExpense, 'id' | 'createdAt'> & {
  paymentSchedules?: PendingPaymentSchedule[];
  createdAt: unknown;
};

@Injectable({
  providedIn: 'root',
})
export class PendingExpenseService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly notifications = inject(NotificationService);

  itemsForUser(userId: string): Observable<PendingExpense[]> {
    return new Observable((subscriber) => {
      const pendingRef = collection(this.firestore, `users/${userId}/pendingExpenses`);
      const pendingQuery = query(pendingRef, orderBy('name', 'asc'));

      return onSnapshot(
        pendingQuery,
        (snapshot) => {
          subscriber.next(
            snapshot.docs.map((snapshotDoc) => {
              const pending = snapshotDoc.data() as PendingExpenseDocument;
              return {
                id: snapshotDoc.id,
                userId: pending.userId,
                catalogItemId: pending.catalogItemId,
                name: pending.name,
                icon: pending.icon || '🧾',
                category: pending.category,
                type: pending.type,
                paymentSchedules: this.normalizeSchedules(pending),
                amount: Number(pending.amount || 0),
                dueDays: [...(pending.dueDays || [])].sort((a, b) => a - b),
                completedDueDates: pending.completedDueDates || [],
                active: pending.active !== false,
                createdAt: this.asIsoDate(pending.createdAt),
              };
            }),
          );
        },
        (error) => subscriber.error(error),
      );
    });
  }

  async addItem(userId: string, input: PendingExpenseInput): Promise<void> {
    try {
      const pendingRef = collection(this.firestore, `users/${userId}/pendingExpenses`);
      const paymentSchedules = [...input.paymentSchedules].sort((a, b) => a.day - b.day);
      await addDoc(pendingRef, {
        userId,
        catalogItemId: input.catalogItemId,
        name: input.name,
        icon: input.icon || '🧾',
        category: input.category,
        type: input.type,
        paymentSchedules,
        amount: Number(paymentSchedules[0]?.amount || input.amount || 0),
        dueDays: paymentSchedules.map((schedule) => schedule.day),
        completedDueDates: [],
        active: input.active,
        createdAt: serverTimestamp(),
      });
      this.notifications.success('Pendiente guardado correctamente.');
    } catch (error) {
      this.notifications.error('No se pudo guardar el pendiente.');
      throw error;
    }
  }

  async markDueDateCompleted(userId: string, pendingId: string, dueDateKey: string): Promise<void> {
    try {
      const pendingRef = doc(this.firestore, `users/${userId}/pendingExpenses/${pendingId}`);
      await updateDoc(pendingRef, {
        completedDueDates: arrayUnion(dueDateKey),
      });
      this.notifications.success('Pendiente marcado como registrado.');
    } catch (error) {
      this.notifications.error('No se pudo registrar el pendiente.');
      throw error;
    }
  }

  async deleteItem(userId: string, pendingId: string): Promise<void> {
    try {
      const pendingRef = doc(this.firestore, `users/${userId}/pendingExpenses/${pendingId}`);
      await deleteDoc(pendingRef);
      this.notifications.warning('Pendiente eliminado.');
    } catch (error) {
      this.notifications.error('No se pudo eliminar el pendiente.');
      throw error;
    }
  }

  private normalizeSchedules(pending: PendingExpenseDocument): PendingPaymentSchedule[] {
    if (Array.isArray(pending.paymentSchedules) && pending.paymentSchedules.length) {
      return pending.paymentSchedules
        .filter((schedule) => Number.isInteger(schedule.day) && schedule.day >= 1 && schedule.day <= 31)
        .map((schedule) => ({ day: schedule.day, amount: Number(schedule.amount || 0) }))
        .sort((a, b) => a.day - b.day);
    }

    const dueDays = [...(pending.dueDays || [])]
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31)
      .sort((a, b) => a - b);
    const fallbackAmount = Number(pending.amount || 0);
    return dueDays.map((day) => ({ day, amount: fallbackAmount }));
  }

  private asIsoDate(value: unknown): string {
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof value.toDate === 'function'
    ) {
      return value.toDate().toISOString();
    }

    return new Date().toISOString();
  }
}
