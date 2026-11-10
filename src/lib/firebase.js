import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsSupported } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Placeholders keep the app rendering (with a "not configured" banner on the login page)
// instead of crashing at startup when .env is missing.
export const app = initializeApp(
  firebaseConfigured
    ? firebaseConfig
    : { ...firebaseConfig, apiKey: "missing-api-key", projectId: "missing-project", appId: "missing-app" }
);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();

// Analytics only works in browsers that support it (and not in the dev server
// without a measurementId), so it is initialised lazily and never blocks the app.
if (firebaseConfigured && firebaseConfig.measurementId) {
  analyticsSupported()
    .then((ok) => ok && getAnalytics(app))
    .catch(() => {});
}
