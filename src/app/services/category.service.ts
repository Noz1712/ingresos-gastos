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
import { CategoryKind, UserCategory, UserCategoryInput } from '../models/category.model';
import { NotificationService } from './notification.service';

type CategoryDocument = Omit<UserCategory, 'id' | 'createdAt'> & {
  createdAt: unknown;
};

@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly notifications = inject(NotificationService);

  categoriesForUser(userId: string, kind: CategoryKind): Observable<UserCategory[]> {
    return new Observable((subscriber) => {
      const categoriesRef = collection(this.firestore, `users/${userId}/${kind}`);
      const categoriesQuery = query(categoriesRef, orderBy('name', 'asc'));

      return onSnapshot(
        categoriesQuery,
        (snapshot) => {
          subscriber.next(
            snapshot.docs.map((snapshotDoc) => {
              const category = snapshotDoc.data() as CategoryDocument;
              return {
                id: snapshotDoc.id,
                userId: category.userId,
                name: category.name,
                color: category.color,
                icon: category.icon || '🏷️',
                createdAt: this.asIsoDate(category.createdAt),
              };
            }),
          );
        },
        (error) => subscriber.error(error),
      );
    });
  }

  async addCategory(userId: string, kind: CategoryKind, input: UserCategoryInput): Promise<void> {
    try {
      const categoriesRef = collection(this.firestore, `users/${userId}/${kind}`);
      await addDoc(categoriesRef, {
        userId,
        name: input.name.trim(),
        color: input.color || '#76b4ff',
        icon: input.icon || '🏷️',
        createdAt: serverTimestamp(),
      });
      this.notifications.success('Categoria guardada correctamente.');
    } catch (error) {
      this.notifications.error('No se pudo guardar la categoria.');
      throw error;
    }
  }

  async deleteCategory(userId: string, kind: CategoryKind, categoryId: string): Promise<void> {
    try {
      const categoryRef = doc(this.firestore, `users/${userId}/${kind}/${categoryId}`);
      await deleteDoc(categoryRef);
      this.notifications.success('Categoria eliminada correctamente.');
    } catch (error) {
      this.notifications.error('No se pudo eliminar la categoria.');
      throw error;
    }
  }

  async updateCategory(
    userId: string,
    kind: CategoryKind,
    categoryId: string,
    input: UserCategoryInput,
  ): Promise<void> {
    try {
      const categoryRef = doc(this.firestore, `users/${userId}/${kind}/${categoryId}`);
      await updateDoc(categoryRef, {
        name: input.name.trim(),
        color: input.color || '#76b4ff',
        icon: input.icon || '🏷️',
      });
      this.notifications.success('Categoria actualizada correctamente.');
    } catch (error) {
      this.notifications.error('No se pudo actualizar la categoria.');
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
