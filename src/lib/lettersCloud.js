import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { FIREBASE_NAMESPACE, getFirebaseDb, isFirebaseConfigured } from './firebase'

const getLettersCollection = () => {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore belum dikonfigurasi.')
  }

  return collection(db, 'instances', FIREBASE_NAMESPACE, 'letters')
}

export const listenToCloudLetters = ({ onData, onError }) => {
  if (!isFirebaseConfigured) {
    return () => {}
  }

  const lettersQuery = query(getLettersCollection(), orderBy('lastUpdate', 'desc'))

  return onSnapshot(
    lettersQuery,
    (snapshot) => {
      const rows = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }))

      onData(rows)
    },
    (error) => {
      onError(error)
    },
  )
}

export const createCloudLetter = async (letter) => {
  const lettersCollection = getLettersCollection()
  await setDoc(doc(lettersCollection, letter.id), letter)
}

export const updateCloudLetter = async (id, updates) => {
  const db = getFirebaseDb()
  await updateDoc(doc(db, 'instances', FIREBASE_NAMESPACE, 'letters', id), updates)
}

export const deleteCloudLetter = async (id) => {
  const db = getFirebaseDb()
  await deleteDoc(doc(db, 'instances', FIREBASE_NAMESPACE, 'letters', id))
}

export const seedCloudLetters = async (letters) => {
  if (!letters.length) return

  const db = getFirebaseDb()
  const batch = writeBatch(db)

  letters.forEach((letter) => {
    const ref = doc(db, 'instances', FIREBASE_NAMESPACE, 'letters', letter.id)
    batch.set(ref, letter)
  })

  await batch.commit()
}

export const hasCloudLetters = async () => {
  const snapshot = await getDocs(query(getLettersCollection()))
  return !snapshot.empty
}
