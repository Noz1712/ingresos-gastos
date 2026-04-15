import { inject, Injectable } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { Observable } from 'rxjs';
import { FIREBASE_AUTH } from '../firebase.tokens';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly provider = new GoogleAuthProvider();

  readonly user$: Observable<User | null> = new Observable((subscriber) => {
    const unsubscribe = onAuthStateChanged(
      this.auth,
      (user) => subscriber.next(user),
      (error) => subscriber.error(error),
      () => subscriber.complete(),
    );

    return unsubscribe;
  });

  signInWithGoogle(): Promise<void> {
    return signInWithPopup(this.auth, this.provider).then(() => undefined);
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }
}
