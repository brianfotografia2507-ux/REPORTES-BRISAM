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
  addDoc,
  collection,
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
var currentUserProfile = null;
var firebaseAvailable = !!firebaseReady && !!auth && !!db;
var firestoreReadApiPromise = null;

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

function getFirebaseErrorCode(err) {
  if (!err || !err.code) return "";
  return String(err.code).trim();
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
  var role = "tecnico";
  var password = $("register-password").value;
  var confirm = $("register-password-confirm").value;

  if (!name) return setAuthMessage("Ingresa tu nombre completo.", "error");
  if (!isValidEmail(email)) return setAuthMessage("Ingresa un email válido.", "error");
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
    if (getFirebaseErrorCode(err) === "auth/email-already-in-use") {
      setAuthMessage("Este usuario ya existe", "error");
      return;
    }
    setAuthMessage("No fue posible crear la cuenta. Intenta nuevamente.", "error");
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
    currentUserProfile = null;
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
    currentUserProfile = profile || {};
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

window.saveReportToFirestore = async function saveReportToFirestore(reportData) {
  if (!firebaseAvailable) {
    throw new Error("Firebase no está disponible.");
  }

  var user = auth.currentUser;
  if (!user) {
    throw new Error("Debes iniciar sesión para guardar reportes.");
  }

  var profile = currentUserProfile;
  if (!profile || !profile.role) {
    profile = (await getProfile(user.uid)) || {};
    currentUserProfile = profile;
  }

  var payload = Object.assign({}, reportData || {});
  payload.uid = user.uid;
  payload.tecnicoNombre =
    profile.name ||
    payload.tecnicoNombre ||
    user.displayName ||
    user.email ||
    "Técnico";
  payload.fecha = serverTimestamp();
  payload.userEmail = user.email || "";
  payload.userRole = profile.role || "";

  var created = await addDoc(collection(db, "reportes"), payload);
  return { id: created.id };
};

function asMillis(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function formatReportDate(value) {
  var ms = asMillis(value);
  if (!ms) return "Sin fecha";
  return new Date(ms).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getFirestoreReadApi() {
  if (firestoreReadApiPromise) {
    return firestoreReadApiPromise;
  }

  firestoreReadApiPromise = import(
    "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js"
  )
    .then(function (mod) {
      return {
        getDocs: mod.getDocs,
        query: mod.query,
        where: mod.where,
      };
    })
    .catch(function (err) {
      console.error("No se pudo cargar API de lectura Firestore:", err);
      return null;
    });

  return firestoreReadApiPromise;
}

function renderReportsInPanel(reportDocs) {
  var container = $("rpt-content");
  if (!container) return;

  if (!reportDocs.length) {
    container.innerHTML =
      '<div class="empty"><div class="empty-ico">📋</div>No hay reportes guardados todavía</div>';
    return;
  }

  var cards = reportDocs
    .map(function (item) {
      var data = item.data;
      var checklist = data.checklist && data.checklist.name ? data.checklist.name : "—";
      var tecnico = data.tecnicoNombre || "—";
      var fecha = formatReportDate(data.fecha);
      var observaciones = (data.observaciones || "").trim();
      var preview = observaciones ? escapeHtml(observaciones).slice(0, 180) : "Sin observaciones";
      var progreso =
        data.respuestas &&
        data.respuestas.progreso &&
        typeof data.respuestas.progreso.porcentaje === "number"
          ? data.respuestas.progreso.porcentaje + "%"
          : "—";

      return (
        '<div class="card">' +
        '<div class="card-head">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div class="card-ico" style="background:rgba(59,130,246,.1);">📄</div>' +
        "<div>" +
        '<div class="card-title">' + escapeHtml(data.ordenId || item.id) + "</div>" +
        '<div class="card-sub">' + escapeHtml(checklist) + "</div>" +
        "</div>" +
        "</div>" +
        "</div>" +
        '<div style="font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:4px;">' +
        "<span>👷 " + escapeHtml(tecnico) + "</span>" +
        "<span>📅 " + escapeHtml(fecha) + "</span>" +
        "<span>📈 Progreso: " + escapeHtml(progreso) + "</span>" +
        "</div>" +
        '<div style="margin-top:10px;font-size:12px;color:var(--muted2);line-height:1.45;">' +
        preview +
        "</div>" +
        '<div class="card-meta"><span class="chip">ID: ' +
        escapeHtml(item.id) +
        "</span></div>" +
        "</div>"
      );
    })
    .join("");

  container.innerHTML = '<div class="cards">' + cards + "</div>";
}

window.loadReportsIntoPanel = async function loadReportsIntoPanel() {
  if (!firebaseAvailable || !auth.currentUser) return;

  var container = $("rpt-content");
  if (!container) return;
  container.innerHTML =
    '<div class="empty"><div class="empty-ico">⏳</div>Cargando reportes...</div>';

  try {
    var readApi = await getFirestoreReadApi();
    if (!readApi || !readApi.getDocs || !readApi.query || !readApi.where) {
      throw new Error("Firestore read API no disponible");
    }

    var user = auth.currentUser;
    var profile = currentUserProfile;
    if (!profile || !profile.role) {
      profile = (await getProfile(user.uid)) || {};
      currentUserProfile = profile;
    }

    var snap;
    if (profile.role === "administrador") {
      snap = await readApi.getDocs(collection(db, "reportes"));
    } else {
      snap = await readApi.getDocs(
        readApi.query(collection(db, "reportes"), readApi.where("uid", "==", user.uid))
      );
    }

    var docs = snap.docs
      .map(function (d) {
        return { id: d.id, data: d.data() || {} };
      })
      .sort(function (a, b) {
        return asMillis(b.data.fecha) - asMillis(a.data.fecha);
      });

    renderReportsInPanel(docs);
  } catch (err) {
    console.error("Error cargando reportes:", err);
    container.innerHTML =
      '<div class="empty"><div class="empty-ico">⚠️</div>No se pudieron cargar los reportes</div>';
  }
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
    if (user) {
      window.loadReportsIntoPanel();
    }
  });
}
