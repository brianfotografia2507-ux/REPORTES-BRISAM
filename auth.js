import {
  auth,
  db,
  firebaseReady
} from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

var roleLandingPage = {
  tecnico: "tech",
  administrador: "report"
};

var roleAllowedPages = {
  tecnico: ["tech", "report"],
  administrador: ["dashboard", "orders", "clients", "branches", "technicians", "equipment", "checklists", "report"]
};

var currentRole = null;
var firebaseAvailable = !!firebaseReady && !!auth && !!db;

function $(id) {
  return document.getElementById(id);
}

function setAuthMessage(msg, cls) {
  var el = $("auth-msg");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "auth-msg" + (cls ? " " + cls : "");
}

function ensureFirebaseReady() {
  if (firebaseAvailable) return true;
  setAuthMessage(
    "Firebase no está disponible. Verifica la configuración de firebase-config.js.",
    "error"
  );
  return false;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function roleLabel(role) {
  if (role === "tecnico") return "Técnico";
  if (role === "administrador") return "Administrador";
  return "Sin rol";
}

function normalizeRole(role) {
  if (role === "tecnico" || role === "administrador") return role;
  return null;
}

function activateTab(mode) {
  var isLogin = mode === "login";
  $("tab-login").classList.toggle("on", isLogin);
  $("tab-register").classList.toggle("on", !isLogin);
  $("login-form").classList.toggle("on", isLogin);
  $("register-form").classList.toggle("on", !isLogin);
  setAuthMessage("");
}

function getUserInitials(name, email) {
  if (name && name.trim()) {
    var parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }
  return (email || "U").slice(0, 2).toUpperCase();
}

function setUserHeader(userProfile, fallbackEmail) {
  var name = userProfile.name || fallbackEmail || "Usuario";
  $("s-user-name").textContent = name;
  $("s-user-role").textContent = roleLabel(userProfile.role);
  $("s-user-av").textContent = getUserInitials(name, fallbackEmail);
}

function applyRoleVisibility(role) {
  currentRole = role;
  var items = document.querySelectorAll("[data-role]");
  items.forEach(function (el) {
    var allowed = (el.getAttribute("data-role") || "").split(",").map(function (s) {
      return s.trim();
    });
    var show = allowed.indexOf(role) !== -1;
    el.classList.toggle("hidden-by-role", !show);
  });
}

function goRoleLanding(role) {
  var page = roleLandingPage[role] || "dashboard";
  var navEl = $("ni-" + page);
  if (!navEl) {
    // fallback for safety
    page = role === "tecnico" ? "tech" : "dashboard";
    navEl = $("ni-" + page);
  }
  if (navEl && typeof window.goTo === "function") {
    window.goTo(page, navEl);
  }
}

async function getProfile(uid) {
  if (!firebaseAvailable) return null;
  var ref = doc(db, "users", uid);
  var snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

function showApp(show) {
  $("auth-view").style.display = show ? "none" : "flex";
  $("app-view").style.display = show ? "" : "none";
  $("btn-logout").style.display = show ? "inline-flex" : "none";
}

async function handleRegister(ev) {
  ev.preventDefault();
  if (!ensureFirebaseReady()) return;

  var name = $("register-name").value.trim();
  var email = $("register-email").value.trim().toLowerCase();
  var role = normalizeRole($("register-role").value);
  var password = $("register-password").value;
  var confirm = $("register-password-confirm").value;

  if (!name) return setAuthMessage("Ingresa tu nombre completo.", "error");
  if (!isValidEmail(email)) return setAuthMessage("Ingresa un email válido.", "error");
  if (!role) return setAuthMessage("Selecciona un rol válido.", "error");
  if (!password || password.length < 6) return setAuthMessage("La contraseña debe tener al menos 6 caracteres.", "error");
  if (password !== confirm) return setAuthMessage("Las contraseñas no coinciden.", "error");

  try {
    setAuthMessage("Creando cuenta...", "");
    var cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      name: name,
      email: email,
      role: role,
      createdAt: serverTimestamp()
    });
    setAuthMessage("Cuenta creada correctamente. Redirigiendo...", "success");
  } catch (err) {
    setAuthMessage("No fue posible crear la cuenta: " + (err && err.message ? err.message : "Error desconocido"), "error");
  }
}

async function handleLogin(ev) {
  ev.preventDefault();
  if (!ensureFirebaseReady()) return;
  var email = $("login-email").value.trim().toLowerCase();
  var password = $("login-password").value;
  if (!isValidEmail(email)) return setAuthMessage("Ingresa un email válido.", "error");
  if (!password) return setAuthMessage("Ingresa tu contraseña.", "error");

  try {
    setAuthMessage("Iniciando sesión...", "");
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    setAuthMessage("No fue posible iniciar sesión: " + (err && err.message ? err.message : "Error desconocido"), "error");
  }
}

async function loadUserState(user) {
  if (!firebaseAvailable) {
    showApp(false);
    return;
  }

  if (!user) {
    currentRole = null;
    showApp(false);
    return;
  }

  try {
    var profile = await getProfile(user.uid);
    var role = normalizeRole(profile && profile.role);
    if (!role) {
      await signOut(auth);
      setAuthMessage("Tu usuario no tiene un rol válido asignado.", "error");
      return;
    }
    applyRoleVisibility(role);
    setUserHeader(profile || {}, user.email || "");
    showApp(true);
    goRoleLanding(role);
  } catch (err) {
    await signOut(auth);
    setAuthMessage("No fue posible cargar el perfil del usuario.", "error");
  }
}

function setupEvents() {
  var tabLogin = $("tab-login");
  var tabRegister = $("tab-register");
  var loginForm = $("login-form");
  var registerForm = $("register-form");
  var registerBtn = $("register-submit");
  var loginBtn = $("login-submit");

  if (tabLogin) {
    tabLogin.addEventListener("click", function () {
      activateTab("login");
    });
  }

  if (tabRegister) {
    tabRegister.addEventListener("click", function () {
      activateTab("register");
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
  }

  // Fallback explícito: algunos navegadores/extensiones bloquean submit implícito.
  if (registerBtn && registerForm) {
    registerBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      handleRegister(ev);
    });
  }

  if (loginBtn && loginForm) {
    loginBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      handleLogin(ev);
    });
  }
}

window.canAccessPage = function canAccessPage(page) {
  if (!currentRole) return false;
  var allowed = roleAllowedPages[currentRole] || [];
  return allowed.indexOf(page) !== -1;
};

window.logoutUser = async function logoutUser() {
  if (!firebaseAvailable) return;
  await signOut(auth);
};

setupEvents();

if (!firebaseAvailable) {
  setAuthMessage(
    "Firebase no está configurado. Completa firebase-config.js para activar el acceso.",
    "error"
  );
  var loginBtn = $("login-submit");
  var registerBtn = $("register-submit");
  if (loginBtn) loginBtn.disabled = true;
  if (registerBtn) registerBtn.disabled = true;
} else {
  onAuthStateChanged(auth, function (user) {
    loadUserState(user);
  });
}
