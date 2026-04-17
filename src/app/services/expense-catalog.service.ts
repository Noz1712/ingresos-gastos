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
  CatalogScheduleEntry,
  DebtPaymentMode,
  ExpenseCatalogInput,
  ExpenseCatalogItem,
  ExpenseCatalogType,
} from '../models/expense-catalog.model';
import { NotificationService } from './notification.service';

type ExpenseCatalogDocument = Omit<ExpenseCatalogItem, 'id' | 'createdAt'> & {
  type?: ExpenseCatalogType;
  category?: string;
  color?: string;
  initialDebt?: number | null;
  debtPaymentMode?: DebtPaymentMode | null;
  paymentSchedules?: CatalogScheduleEntry[];
  endDate?: string | null;
  isIndefinite?: boolean;
  createdAt: unknown;
};

@Injectable({
  providedIn: 'root',
})
export class ExpenseCatalogService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly notifications = inject(NotificationService);

  itemsForUser(userId: string): Observable<ExpenseCatalogItem[]> {
    return new Observable((subscriber) => {
      const catalogRef = collection(this.firestore, `users/${userId}/expenseCatalog`);
      const catalogQuery = query(catalogRef, orderBy('name', 'asc'));

      return onSnapshot(
        catalogQuery,
        (snapshot) => {
          subscriber.next(
            snapshot.docs.map((snapshotDoc) => {
              const item = snapshotDoc.data() as ExpenseCatalogDocument;
              const legacyType = item.category;
              const type = item.type ?? this.asCatalogType(legacyType) ?? 'Eventual';
              const category = this.isCatalogType(legacyType) ? 'Sin categoria' : (legacyType ?? 'Sin categoria');
              return {
                id: snapshotDoc.id,
                userId: item.userId,
                type,
                category,
                name: item.name,
                color: item.color || '#76b4ff',
                icon: item.icon || '🧾',
                initialDebt: typeof item.initialDebt === 'number' ? item.initialDebt : null,
                debtPaymentMode:
                  item.type === 'Deuda'
                    ? item.debtPaymentMode ?? 'Recurrente'
                    : null,
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

  async addItem(userId: string, input: ExpenseCatalogInput): Promise<string> {
    try {
      const catalogRef = collection(this.firestore, `users/${userId}/expenseCatalog`);
      const type = input.type;
      const created = await addDoc(catalogRef, {
        userId,
        type,
        category: input.category.trim(),
        name: input.name.trim(),
        color: input.color || '#76b4ff',
        icon: input.icon || '🧾',
        initialDebt: type === 'Deuda' ? Number(input.initialDebt || 0) : null,
        debtPaymentMode: type === 'Deuda' ? input.debtPaymentMode ?? 'PagoUnico' : null,
        paymentSchedules: this.normalizeSchedules(input.paymentSchedules),
        endDate: input.endDate ?? null,
        isIndefinite: input.isIndefinite !== false,
        createdAt: serverTimestamp(),
      });
      this.notifications.success('Gasto de catalogo guardado correctamente.');
      return created.id;
    } catch (error) {
      this.notifications.error('No se pudo guardar el gasto de catalogo.');
      throw error;
    }
  }

  async updateItem(userId: string, itemId: string, input: ExpenseCatalogInput): Promise<void> {
    try {
      const itemRef = doc(this.firestore, `users/${userId}/expenseCatalog/${itemId}`);
      const type = input.type;
      await updateDoc(itemRef, {
        type,
        category: input.category.trim(),
        name: input.name.trim(),
        color: input.color || '#76b4ff',
        icon: input.icon || '🧾',
        initialDebt: type === 'Deuda' ? Number(input.initialDebt || 0) : null,
        debtPaymentMode: type === 'Deuda' ? input.debtPaymentMode ?? 'PagoUnico' : null,
        paymentSchedules: this.normalizeSchedules(input.paymentSchedules),
        endDate: input.endDate ?? null,
        isIndefinite: input.isIndefinite !== false,
      });
      this.notifications.success('Gasto de catalogo actualizado correctamente.');
    } catch (error) {
      this.notifications.error('No se pudo actualizar el gasto de catalogo.');
      throw error;
    }
  }

  async deleteItem(userId: string, itemId: string): Promise<void> {
    try {
      const itemRef = doc(this.firestore, `users/${userId}/expenseCatalog/${itemId}`);
      await deleteDoc(itemRef);
      this.notifications.warning('Gasto de catalogo eliminado.');
    } catch (error) {
      this.notifications.error('No se pudo eliminar el gasto de catalogo.');
      throw error;
    }
  }

  private normalizeSchedules(entries?: CatalogScheduleEntry[]): CatalogScheduleEntry[] {
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

  private isCatalogType(value: string | undefined): value is ExpenseCatalogType {
    return value === 'Recurrente' || value === 'Deuda' || value === 'Eventual';
  }

  private asCatalogType(value: string | undefined): ExpenseCatalogType | null {
    return this.isCatalogType(value) ? value : null;
  }
}
