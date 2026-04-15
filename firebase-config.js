import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

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

const requiredFirebaseKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

function hasRealFirebaseConfig(config) {
  return requiredFirebaseKeys.every(function (key) {
    var value = config[key];
    return (
      typeof value === "string" &&
      value.trim() !== "" &&
      String(value).indexOf("YOUR_") !== 0
    );
  });
}

let firebaseReady = hasRealFirebaseConfig(firebaseConfig);

let app = null;
let auth = null;
let db = null;
let storage = null;

if (firebaseReady) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    try {
      storage = getStorage(app);
    } catch (storageError) {
      console.error("Error inicializando Firebase Storage:", storageError);
      storage = null;
    }
  } catch (error) {
    firebaseReady = false;
    console.error("Error inicializando Firebase:", error);
  }
} else {
  console.warn(
    "Firebase no está configurado. Edita firebase-config.js con tus credenciales."
  );
}

export { app, auth, db, storage, firebaseReady };
