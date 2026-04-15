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
  updateDoc,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { FIREBASE_FIRESTORE } from '../firebase.tokens';
import {
  IncomeCatalogInput,
  IncomeCatalogItem,
  IncomeCatalogType,
} from '../models/income-catalog.model';

type IncomeCatalogDocument = Omit<IncomeCatalogItem, 'id' | 'createdAt'> & {
  type?: IncomeCatalogType;
  category?: string;
  paymentSchedules?: Array<{ day: number; amount: number }>;
  createdAt: unknown;
};

@Injectable({
  providedIn: 'root',
})
export class IncomeCatalogService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);

  itemsForUser(userId: string): Observable<IncomeCatalogItem[]> {
    return new Observable((subscriber) => {
      const catalogRef = collection(this.firestore, `users/${userId}/incomeCatalog`);
      const catalogQuery = query(catalogRef, orderBy('name', 'asc'));

      return onSnapshot(
        catalogQuery,
        (snapshot) => {
          subscriber.next(
            snapshot.docs.map((snapshotDoc) => {
              const item = snapshotDoc.data() as IncomeCatalogDocument;
              return {
                id: snapshotDoc.id,
                userId: item.userId,
                type: item.type ?? 'Eventual',
                category: item.category ?? 'Sin categoria',
                name: item.name || 'Ingreso',
                fixedAmount: Number(item.fixedAmount || 0),
                color: item.color || '#76b4ff',
                icon: item.icon || '💰',
                paymentSchedules: this.normalizeSchedules(item.paymentSchedules),
                endDate: item.endDate ?? null,
                isIndefinite: item.isIndefinite !== false,
                createdAt: this.asIsoDate(item.createdAt),
              };
            }),
          );
        },
        (error) => subscriber.error(error),
      );
    });
  }

  async addItem(userId: string, input: IncomeCatalogInput): Promise<string> {
    const catalogRef = collection(this.firestore, `users/${userId}/incomeCatalog`);
    const created = await addDoc(catalogRef, {
      userId,
      type: input.type,
      category: input.category.trim(),
      name: input.name.trim(),
      fixedAmount: Number(input.fixedAmount || 0),
      color: input.color || '#76b4ff',
      icon: input.icon || '💰',
      paymentSchedules: this.normalizeSchedules(input.paymentSchedules),
      endDate: input.endDate ?? null,
      isIndefinite: input.isIndefinite !== false,
      createdAt: serverTimestamp(),
    });

    return created.id;
  }

  async updateItem(userId: string, itemId: string, input: IncomeCatalogInput): Promise<void> {
    const itemRef = doc(this.firestore, `users/${userId}/incomeCatalog/${itemId}`);
    await updateDoc(itemRef, {
      type: input.type,
      category: input.category.trim(),
      name: input.name.trim(),
      fixedAmount: Number(input.fixedAmount || 0),
      color: input.color || '#76b4ff',
      icon: input.icon || '💰',
      paymentSchedules: this.normalizeSchedules(input.paymentSchedules),
      endDate: input.endDate ?? null,
      isIndefinite: input.isIndefinite !== false,
    });
  }

  async deleteItem(userId: string, itemId: string): Promise<void> {
    const itemRef = doc(this.firestore, `users/${userId}/incomeCatalog/${itemId}`);
    await deleteDoc(itemRef);
  }

  private normalizeSchedules(entries?: Array<{ day: number; amount: number }>): Array<{ day: number; amount: number }> {
    if (!entries?.length) {
      return [];
    }

    return entries
      .filter((entry) => Number.isInteger(entry.day) && entry.day >= 1 && entry.day <= 31)
      .map((entry) => ({ day: entry.day, amount: Number(entry.amount || 0) }))
      .sort((a, b) => a.day - b.day);
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
