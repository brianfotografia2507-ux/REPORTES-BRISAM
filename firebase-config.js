import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Reemplaza estos valores con la configuración de tu proyecto Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyAjgXqF4hcKPdZPiYuhuv2r0o2I9ZvI3PM",
  authDomain: "brisam-sytem.firebaseapp.com",
  projectId: "brisam-sytem",
  storageBucket: "brisam-sytem.firebasestorage.app",
  messagingSenderId: "258281960772",
  appId: "1:258281960772:web:74436c8b3bbf8cf54b9311",
  measurementId: "G-494VKKY21T",
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
