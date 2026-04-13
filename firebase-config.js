import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Reemplaza estos valores con la configuración de tu proyecto Firebase.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

function hasRealFirebaseConfig(config) {
  return Object.values(config).every(function (value) {
    return value && String(value).indexOf("YOUR_") !== 0;
  });
}

const firebaseReady = hasRealFirebaseConfig(firebaseConfig);

let app = null;
let auth = null;
let db = null;

if (firebaseReady) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  console.warn(
    "Firebase no está configurado. Edita firebase-config.js con tus credenciales."
  );
}

export { app, auth, db, firebaseReady };
