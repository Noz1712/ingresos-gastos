import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { FIREBASE_FIRESTORE } from '../firebase.tokens';
import { Income, IncomeInput } from '../models/income.model';
import { NotificationService } from './notification.service';

type IncomeDocument = Omit<Income, 'id' | 'createdAt'> & {
  createdAt: unknown;
};

@Injectable({
  providedIn: 'root',
})
export class IncomeService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly notifications = inject(NotificationService);

  incomesForUser(userId: string): Observable<Income[]> {
    return new Observable((subscriber) => {
      const incomesRef = collection(this.firestore, `users/${userId}/incomes`);
      const incomesQuery = query(incomesRef, orderBy('receivedAt', 'desc'));

      return onSnapshot(
        incomesQuery,
        (snapshot) => {
          subscriber.next(
            snapshot.docs.map((snapshotDoc) => {
              const income = snapshotDoc.data() as IncomeDocument;
              return {
                id: snapshotDoc.id,
                userId: income.userId,
                description: income.description,
                icon: income.icon || '💼',
                amount: income.amount,
                category: income.category,
                receivedAt: income.receivedAt,
                createdAt: this.asIsoDate(income.createdAt),
              };
            }),
          );
        },
        (error) => subscriber.error(error),
      );
    });
  }

  async addIncome(userId: string, income: IncomeInput): Promise<void> {
    try {
      const incomesRef = collection(this.firestore, `users/${userId}/incomes`);
      await addDoc(incomesRef, {
        ...income,
        icon: income.icon || '💼',
        userId,
        createdAt: serverTimestamp(),
      });
      this.notifications.success('Ingreso guardado correctamente.');
    } catch (error) {
      this.notifications.error('No se pudo guardar el ingreso.');
      throw error;
    }
  }

  async deleteIncome(userId: string, incomeId: string): Promise<void> {
    try {
      const incomeRef = doc(this.firestore, `users/${userId}/incomes/${incomeId}`);
      await deleteDoc(incomeRef);
      this.notifications.warning('Ingreso eliminado.');
    } catch (error) {
      this.notifications.error('No se pudo eliminar el ingreso.');
      throw error;
    }
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
