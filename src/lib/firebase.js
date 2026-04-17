import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const FIREBASE_NAMESPACE =
  import.meta.env.VITE_FIREBASE_NAMESPACE?.trim() || 'default'

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean)

let firebaseApp = null
let firestoreDb = null

if (isFirebaseConfigured) {
  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

  try {
    firestoreDb = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  } catch {
    firestoreDb = getFirestore(firebaseApp)
  }
}

export const getFirebaseDb = () => firestoreDb
