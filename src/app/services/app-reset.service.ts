import { inject, Injectable } from '@angular/core';
import { collection, deleteDoc, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import { FIREBASE_FIRESTORE } from '../firebase.tokens';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class AppResetService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  private readonly resetCollections = [
    'incomes',
    'expenses',
    'pendingExpenses',
    'expenseCatalog',
    'incomeCatalog',
    'expenseCategories',
    'incomeCategories',
  ];

  async resetCurrentUserData(): Promise<void> {
    const user = await this.authService.currentUser();
    if (!user) {
      this.notifications.warning('Debes iniciar sesion para reiniciar tus datos.');
      throw new Error('No authenticated user found.');
    }

    try {
      for (const collectionName of this.resetCollections) {
        await this.deleteCollectionDocs(`users/${user.uid}/${collectionName}`);
      }

      const preferencesRef = doc(this.firestore, `users/${user.uid}/settings/preferences`);
      await deleteDoc(preferencesRef).catch(() => undefined);
      this.notifications.warning('Tus datos fueron reiniciados correctamente.');
    } catch (error) {
      this.notifications.error('No se pudo completar el reinicio de datos.');
      throw error;
    }
  }

  private async deleteCollectionDocs(collectionPath: string): Promise<void> {
    const collectionRef = collection(this.firestore, collectionPath);

    while (true) {
      const snapshot = await getDocs(query(collectionRef, limit(200)));
      if (snapshot.empty) {
        break;
      }

      const batch = writeBatch(this.firestore);
      for (const item of snapshot.docs) {
        batch.delete(item.ref);
      }
      await batch.commit();

      if (snapshot.size < 200) {
        break;
      }
    }
  }
}
