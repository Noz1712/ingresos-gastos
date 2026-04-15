import { InjectionToken } from '@angular/core';
import { FirebaseApp, FirebaseOptions, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { environment } from '../environments/environment';

const firebaseOptions = environment.firebase as FirebaseOptions;
const app = initializeApp(firebaseOptions);

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('firebase.app', {
  providedIn: 'root',
  factory: () => app,
});

export const FIREBASE_AUTH = new InjectionToken<Auth>('firebase.auth', {
  providedIn: 'root',
  factory: () => getAuth(app),
});

export const FIREBASE_FIRESTORE = new InjectionToken<Firestore>('firebase.firestore', {
  providedIn: 'root',
  factory: () => getFirestore(app),
});
