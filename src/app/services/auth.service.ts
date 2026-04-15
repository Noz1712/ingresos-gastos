import { inject, Injectable } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
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

  constructor() {
    void getRedirectResult(this.auth).catch(() => undefined);
  }

  signInWithGoogle(): Promise<void> {
    if (this.shouldUseRedirectFlow()) {
      return signInWithRedirect(this.auth, this.provider).then(() => undefined);
    }

    return signInWithPopup(this.auth, this.provider).then(() => undefined);
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }

  currentUser(): Promise<User | null> {
    return new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        this.auth,
        (user) => {
          resolve(user);
          unsubscribe();
        },
        (error) => {
          reject(error);
          unsubscribe();
        },
      );
    });
  }

  private shouldUseRedirectFlow(): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }

    const userAgent = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);

    return isIOS && isSafari;
  }
}
