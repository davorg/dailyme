// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA-yDCxy2uJZ-JbEQJcEA2Y8CL9zpsi0KY",
  authDomain: "daily-me-496ca.firebaseapp.com",
  projectId: "daily-me-496ca",
  storageBucket: "daily-me-496ca.firebasestorage.app",
  messagingSenderId: "1027905546464",
  appId: "1:1027905546464:web:26fa11964a8a43f2110885",
  measurementId: "G-N3RVKETC1G"
};

// Init services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Keep users signed in across reloads
await setPersistence(auth, browserLocalPersistence);

// Heuristic: treat small screens / standalone as “mobile-like”
function shouldUseRedirect() {
  const uaMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  return uaMobile || standalone;
}

export async function handleRedirectResultOnce() {
  // Call this on page load; resolves null if no pending redirect
  return await getRedirectResult(auth);
}

export async function signInSmart() {
  if (shouldUseRedirect()) {
    // Mobile/PWA: more reliable
    return signInWithRedirect(auth, provider);
  }
  // Desktop: popup is fine
  return signInWithPopup(auth, provider);
}

export async function signOutUser() {
  await signOut(auth);
}

export function onUserChanged(callback) {
  onAuthStateChanged(auth, user => {
    callback(user);
  });
}

export async function saveTasks(uid, tasks) {
  await setDoc(doc(db, "users", uid), { tasks });
}

export async function loadTasks(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? snapshot.data().tasks : [];
}

