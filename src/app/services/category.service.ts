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
import { CategoryKind, UserCategory, UserCategoryInput } from '../models/category.model';

type CategoryDocument = Omit<UserCategory, 'id' | 'createdAt'> & {
  createdAt: unknown;
};

@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);

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
    const categoriesRef = collection(this.firestore, `users/${userId}/${kind}`);
    await addDoc(categoriesRef, {
      userId,
      name: input.name.trim(),
      color: input.color,
      icon: input.icon || '🏷️',
      createdAt: serverTimestamp(),
    });
  }

  async deleteCategory(userId: string, kind: CategoryKind, categoryId: string): Promise<void> {
    const categoryRef = doc(this.firestore, `users/${userId}/${kind}/${categoryId}`);
    await deleteDoc(categoryRef);
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
