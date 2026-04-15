import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { FIREBASE_FIRESTORE } from '../firebase.tokens';
import { Expense, ExpenseInput } from '../models/expense.model';

type ExpenseDocument = Omit<Expense, 'id' | 'createdAt'> & {
  createdAt: unknown;
};

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);

  expensesForUser(userId: string): Observable<Expense[]> {
    return new Observable((subscriber) => {
      const expensesRef = collection(this.firestore, `users/${userId}/expenses`);
      const expensesQuery = query(expensesRef, orderBy('spentAt', 'desc'));

      return onSnapshot(
        expensesQuery,
        (snapshot) => {
          subscriber.next(
            snapshot.docs.map((snapshotDoc) => {
              const expense = snapshotDoc.data() as ExpenseDocument;
              return {
                id: snapshotDoc.id,
                userId: expense.userId,
                description: expense.description,
                amount: expense.amount,
                category: expense.category,
                spentAt: expense.spentAt,
                createdAt: this.asIsoDate(expense.createdAt),
              };
            }),
          );
        },
        (error) => subscriber.error(error),
      );
    });
  }

  async addExpense(userId: string, expense: ExpenseInput): Promise<void> {
    const expensesRef = collection(this.firestore, `users/${userId}/expenses`);
    await addDoc(expensesRef, {
      ...expense,
      userId,
      createdAt: serverTimestamp(),
    });
  }

  async deleteExpense(userId: string, expenseId: string): Promise<void> {
    const expenseRef = doc(this.firestore, `users/${userId}/expenses/${expenseId}`);
    await deleteDoc(expenseRef);
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
