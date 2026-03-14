import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
// NOTE: The Firebase project is named "lock-it-a3dee" — this is an external resource
// (live Firestore database + Auth project). Do NOT rename these values to "timesync".
// Renaming would require migrating the live Firebase project, which is out of scope.
const firebaseConfig = {
  apiKey: "AIzaSyCnDuzZGLZCEbVrEAlLRhQmJBMXdMLySHs",
  authDomain: "lock-it-a3dee.firebaseapp.com",
  projectId: "lock-it-a3dee",
  storageBucket: "lock-it-a3dee.firebasestorage.app",
  messagingSenderId: "634357056435",
  appId: "1:634357056435:web:6135c347f26b601f4f01c6",
  measurementId: "G-QNWQCKYTWQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);

export default app;
