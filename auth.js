import {
  auth,
  db,
  storage,
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
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

var roleLandingPage = {
  tecnico: "tech",
  administrador: "report"
};

var roleAllowedPages = {
  tecnico: ["tech", "tech-checklists", "report"],
  administrador: ["dashboard", "map", "orders", "clients", "branches", "technicians", "equipment", "checklists", "report"]
};

var currentRole = null;
var currentUserProfile = null;
var firebaseAvailable = !!firebaseReady && !!auth && !!db;
var storageReady = !!storage;
var firestoreReadApiPromise = null;
var allLoadedReports = [];
var selectedReportForPreview = null;
var reportFilters = {
  tecnico: "",
  from: "",
  to: "",
};
var geocodeCache = {};
var liveLocationWatcherId = null;
var liveLocationTrackingUid = "";
var liveLocationLastWriteAt = 0;
var liveLocationLastCoords = null;
var liveLocationLastStatus = "";
var liveLocationLastOrder = "";
var liveLocationLatestPosition = null;
var liveLocationPulseTimer = null;
var liveLocationUiState = {
  active: false,
  lastSync: "",
  connection: "Sin conexión",
  error: "",
  gps: "inactive",
};

var LIVE_LOCATION_MIN_INTERVAL_MS = 60000;
var LIVE_LOCATION_MIN_DISTANCE_M = 35;
var LIVE_LOCATION_FAST_MOVE_INTERVAL_MS = 15000;
var LIVE_LOCATION_PULSE_MS = 20000;
var adminLiveLocationsUnsubscribe = null;
var checklistUnsubscribe = null;
var branchesUnsubscribe = null;

function withTimeout(promise, ms, label) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error((label || "Operación") + " excedió el tiempo de espera"));
    }, ms);

    Promise.resolve(promise)
      .then(function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

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
    stopLiveLocationTracking();
    stopAdminLiveLocationsSubscription();
    stopChecklistSubscription();
    stopBranchesSubscription();
    emitLiveLocationUiState({
      active: false,
      connection: "Sin sesión",
      lastSync: "",
      error: "",
      gps: "inactive",
    });
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
    startChecklistSubscription(role);
    startBranchesSubscription();
    if (role === "tecnico") {
      stopAdminLiveLocationsSubscription();
      startLiveLocationTracking(user, profile || {}).catch(function (err) {
        console.warn("No se pudo iniciar tracking GPS live:", err);
      });
    } else {
      stopLiveLocationTracking();
      stopAdminLiveLocationsSubscription();
      emitLiveLocationUiState({
        active: false,
        connection: "No aplica para administrador",
        lastSync: "",
        error: "",
        gps: "inactive",
      });
    }
  } catch (err) {
    stopLiveLocationTracking();
    stopAdminLiveLocationsSubscription();
    stopChecklistSubscription();
    stopBranchesSubscription();
    await signOut(auth);
    setAuthMessage("No fue posible cargar el perfil del usuario.", "error");
  }
}

function emitLiveLocationUiState(patch) {
  liveLocationUiState = Object.assign({}, liveLocationUiState, patch || {});
  if (typeof window.updateLiveGpsUi === "function") {
    try {
      window.updateLiveGpsUi(liveLocationUiState);
    } catch (err) {
      console.warn("No se pudo actualizar UI GPS:", err);
    }
  }
}

function toFixedNumber(value, digits) {
  if (typeof value !== "number" || !isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function geoDistanceMeters(aLat, aLng, bLat, bLng) {
  if (
    typeof aLat !== "number" ||
    typeof aLng !== "number" ||
    typeof bLat !== "number" ||
    typeof bLng !== "number"
  ) {
    return Infinity;
  }
  var earth = 6371000;
  var dLat = ((bLat - aLat) * Math.PI) / 180;
  var dLng = ((bLng - aLng) * Math.PI) / 180;
  var sinLat = Math.sin(dLat / 2);
  var sinLng = Math.sin(dLng / 2);
  var q =
    sinLat * sinLat +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return 2 * earth * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function liveContextFromUi() {
  var activeOrder = "";
  if (typeof window.getCurrentActiveOrderId === "function") {
    activeOrder = String(window.getCurrentActiveOrderId() || "").trim();
  }
  var status = activeOrder ? "en_servicio" : "disponible";
  if (typeof window.getTechLiveStatus === "function") {
    var override = String(window.getTechLiveStatus() || "").trim();
    if (override) status = override;
  }
  return {
    status: status,
    ordenActiva: activeOrder,
  };
}

function shouldWriteLiveLocation(nowMs, lat, lng, context, forceWrite) {
  if (forceWrite) return true;
  if (!liveLocationLastWriteAt) return true;
  var elapsed = nowMs - liveLocationLastWriteAt;
  if (
    context &&
    (context.status !== liveLocationLastStatus ||
      context.ordenActiva !== liveLocationLastOrder)
  ) {
    return elapsed >= 5000;
  }
  if (elapsed >= LIVE_LOCATION_MIN_INTERVAL_MS) return true;
  if (!liveLocationLastCoords) return true;
  var moved = geoDistanceMeters(
    liveLocationLastCoords.lat,
    liveLocationLastCoords.lng,
    lat,
    lng
  );
  if (
    moved >= LIVE_LOCATION_MIN_DISTANCE_M &&
    elapsed >= LIVE_LOCATION_FAST_MOVE_INTERVAL_MS
  ) {
    return true;
  }
  return false;
}

async function writeLiveLocationDoc(user, profile, position, forceWrite) {
  if (!firebaseAvailable || !db || !user || !profile || profile.role !== "tecnico") {
    return false;
  }
  var nowMs = Date.now();
  var coords = position && position.coords ? position.coords : null;
  var lat = coords ? toFixedNumber(coords.latitude, 6) : null;
  var lng = coords ? toFixedNumber(coords.longitude, 6) : null;
  var accuracy =
    coords && typeof coords.accuracy === "number"
      ? Math.round(coords.accuracy)
      : null;
  var context = liveContextFromUi();

  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !shouldWriteLiveLocation(nowMs, lat, lng, context, !!forceWrite)
  ) {
    if (!forceWrite) return false;
  }

  var payload = {
    uid: user.uid,
    nombre: profile.name || user.displayName || user.email || "Técnico",
    email: user.email || profile.email || "",
    role: "tecnico",
    timestamp: serverTimestamp(),
    online: true,
    status: context.status || "disponible",
    ordenActiva: context.ordenActiva || "",
  };
  if (typeof lat === "number" && typeof lng === "number") {
    payload.lat = lat;
    payload.lng = lng;
    payload.accuracy = typeof accuracy === "number" ? accuracy : 0;
  }

  await setDoc(doc(db, "live_locations", user.uid), payload, { merge: true });

  liveLocationLastWriteAt = nowMs;
  if (typeof lat === "number" && typeof lng === "number") {
    liveLocationLastCoords = { lat: lat, lng: lng };
  }
  liveLocationLastStatus = payload.status;
  liveLocationLastOrder = payload.ordenActiva;
  liveLocationUiState.lastSync = new Date(nowMs).toISOString();
  emitLiveLocationUiState({
    active: true,
    gps: "active",
    connection: "Conectado",
    error: "",
    lastSync: liveLocationUiState.lastSync,
  });
  return true;
}

async function setLiveLocationOffline(reason) {
  if (!firebaseAvailable || !db || !liveLocationTrackingUid) return;
  try {
    await setDoc(
      doc(db, "live_locations", liveLocationTrackingUid),
      {
        online: false,
        status: "offline",
        ordenActiva: "",
        timestamp: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("No se pudo marcar técnico offline:", err);
  } finally {
    emitLiveLocationUiState({
      active: false,
      gps: "inactive",
      connection: "Desconectado",
      error: reason || "",
    });
  }
}

function stopLiveLocationTracking() {
  if (liveLocationWatcherId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(liveLocationWatcherId);
  }
  if (liveLocationPulseTimer) {
    clearInterval(liveLocationPulseTimer);
  }
  liveLocationWatcherId = null;
  liveLocationPulseTimer = null;
  liveLocationLatestPosition = null;
  liveLocationLastWriteAt = 0;
  liveLocationLastCoords = null;
  liveLocationLastStatus = "";
  liveLocationLastOrder = "";
  liveLocationTrackingUid = "";
}

function stopAdminLiveLocationsSubscription() {
  if (adminLiveLocationsUnsubscribe) {
    try {
      adminLiveLocationsUnsubscribe();
    } catch (err) {
      console.warn("Error cerrando suscripción live_locations:", err);
    }
    adminLiveLocationsUnsubscribe = null;
  }
}

function stopChecklistSubscription() {
  if (checklistUnsubscribe) {
    try {
      checklistUnsubscribe();
    } catch (err) {
      console.warn("Error cerrando suscripción checklists:", err);
    }
    checklistUnsubscribe = null;
  }
}

function stopBranchesSubscription() {
  if (branchesUnsubscribe) {
    try {
      branchesUnsubscribe();
    } catch (err) {
      console.warn("Error cerrando suscripción branches:", err);
    }
    branchesUnsubscribe = null;
  }
}

function normalizeBranchNumber(value) {
  if (typeof value === "number" && isFinite(value)) return value;
  var parsed = Number(value);
  return isFinite(parsed) ? parsed : null;
}

function mapBranchDoc(snap) {
  var data = (snap && typeof snap.data === "function" ? snap.data() : {}) || {};
  var lat = normalizeBranchNumber(data.lat);
  var lng = normalizeBranchNumber(data.lng);
  var radius = normalizeBranchNumber(data.geofenceRadius);
  return {
    id: snap.id,
    clientId: String(data.clientId || "").trim(),
    name: String(data.name || "").trim() || "Sucursal",
    address: String(data.address || "").trim(),
    contact: String(data.contact || "").trim(),
    phone: String(data.phone || "").trim(),
    status: data.status === "inactive" ? "inactive" : "active",
    lat: lat,
    lng: lng,
    geofenceRadius: radius && radius > 0 ? Math.round(radius) : 120,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    createdBy: data.createdBy || "",
  };
}

function emitBranchDocs(branchDocs) {
  if (typeof window.setFirestoreBranchesData === "function") {
    try {
      window.setFirestoreBranchesData(branchDocs);
    } catch (err) {
      console.warn("No se pudo actualizar branches en UI:", err);
    }
  }
}

function startBranchesSubscription() {
  if (!firebaseAvailable || !db || !auth.currentUser) return;
  stopBranchesSubscription();
  branchesUnsubscribe = onSnapshot(
    collection(db, "branches"),
    function (snap) {
      var docs = [];
      snap.forEach(function (item) {
        docs.push(mapBranchDoc(item));
      });
      emitBranchDocs(docs);
    },
    function (err) {
      console.error("Error sincronizando branches:", err);
      if (typeof window.toast === "function" && currentRole === "administrador") {
        window.toast("⚠️ No se pudieron sincronizar sucursales");
      }
    }
  );
}

function emitChecklistDocs(checklistDocs) {
  if (typeof window.setFirestoreChecklistsData === "function") {
    try {
      window.setFirestoreChecklistsData(checklistDocs);
    } catch (err) {
      console.warn("No se pudo actualizar checklists en UI:", err);
    }
  }
}

function mapChecklistDoc(snap) {
  var data = (snap && typeof snap.data === "function" ? snap.data() : {}) || {};
  var name = String(data.name || "").trim();
  var type = String(data.type || "General");
  return {
    id: snap.id,
    name: name,
    type: type,
    templateType: normalizeChecklistTemplateType(data.templateType, name, type),
    published: data.published === true,
    sections: Array.isArray(data.sections) ? data.sections : [],
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    createdBy: data.createdBy || "",
  };
}

function startChecklistSubscription(role) {
  if (!firebaseAvailable || !db || !auth.currentUser) return;
  stopChecklistSubscription();
  var ref = collection(db, "checklists");
  var source = role === "tecnico" ? query(ref, where("published", "==", true)) : ref;
  checklistUnsubscribe = onSnapshot(
    source,
    function (snap) {
      var docs = [];
      snap.forEach(function (item) {
        docs.push(mapChecklistDoc(item));
        if (role === "administrador") {
          var raw = (item && typeof item.data === "function" ? item.data() : {}) || {};
          var inferred = normalizeChecklistTemplateType(
            raw.templateType,
            raw.name,
            raw.type
          );
          if (!raw.templateType && inferred === "correctivo") {
            setDoc(
              doc(db, "checklists", item.id),
              { templateType: "correctivo", updatedAt: serverTimestamp() },
              { merge: true }
            ).catch(function (err) {
              console.warn("No se pudo backfillear templateType correctivo:", err);
            });
          }
        }
      });
      emitChecklistDocs(docs);
    },
    function (err) {
      console.error("Error sincronizando checklists:", err);
      if (typeof window.toast === "function" && currentRole === "administrador") {
        window.toast("⚠️ No se pudieron sincronizar checklists");
      }
    }
  );
}

async function startLiveLocationTracking(user, profile) {
  stopLiveLocationTracking();
  if (!user || !profile || profile.role !== "tecnico") return;

  liveLocationTrackingUid = user.uid;
  emitLiveLocationUiState({
    active: false,
    gps: "inactive",
    connection: "Solicitando permisos GPS...",
    error: "",
    lastSync: "",
  });

  if (!navigator.geolocation) {
    emitLiveLocationUiState({
      active: false,
      gps: "unsupported",
      connection: "GPS no soportado",
      error: "Este dispositivo no soporta geolocalización.",
    });
    return;
  }

  try {
    if (navigator.permissions && navigator.permissions.query) {
      var permission = await navigator.permissions.query({ name: "geolocation" });
      if (permission && permission.state === "denied") {
        emitLiveLocationUiState({
          active: false,
          gps: "denied",
          connection: "Permiso denegado",
          error: "Activa permisos de ubicación en el navegador.",
        });
      }
    }
  } catch (permErr) {
    console.warn("No se pudo leer estado de permiso GPS:", permErr);
  }

  await writeLiveLocationDoc(user, profile, null, true);

  liveLocationWatcherId = navigator.geolocation.watchPosition(
    function (position) {
      liveLocationLatestPosition = position;
      writeLiveLocationDoc(user, profile, position, false).catch(function (err) {
        console.error("Error guardando ubicación live:", err);
        emitLiveLocationUiState({
          connection: "Error al sincronizar",
          error: "No se pudo guardar la ubicación en Firestore.",
        });
      });
    },
    function (err) {
      var msg = "Error de GPS";
      if (err && err.code === 1) msg = "Permiso denegado";
      if (err && err.code === 2) msg = "Señal GPS no disponible";
      if (err && err.code === 3) msg = "Tiempo de espera agotado";
      emitLiveLocationUiState({
        active: false,
        gps: "error",
        connection: msg,
        error: msg,
      });
      console.warn("watchPosition error:", err);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 20000,
    }
  );

  liveLocationPulseTimer = setInterval(function () {
    var authUser = auth.currentUser;
    if (!authUser || authUser.uid !== user.uid) return;
    writeLiveLocationDoc(authUser, profile, liveLocationLatestPosition, false).catch(
      function (err) {
        console.warn("Pulse GPS live falló:", err);
      }
    );
  }, LIVE_LOCATION_PULSE_MS);
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
  try {
    if (
      auth.currentUser &&
      currentUserProfile &&
      currentUserProfile.role === "tecnico"
    ) {
      await setLiveLocationOffline("Cerraste sesión");
    }
  } catch (err) {
    console.warn("No se pudo sincronizar estado offline en logout:", err);
  } finally {
    stopLiveLocationTracking();
    stopAdminLiveLocationsSubscription();
    stopChecklistSubscription();
    stopBranchesSubscription();
    await signOut(auth);
  }
};

window.notifyLiveTrackingContextChanged = async function notifyLiveTrackingContextChanged() {
  if (!firebaseAvailable || !auth.currentUser) return false;
  if (!currentUserProfile || currentUserProfile.role !== "tecnico") return false;
  return writeLiveLocationDoc(
    auth.currentUser,
    currentUserProfile,
    liveLocationLatestPosition,
    true
  );
};

window.stopAdminLiveLocationsSubscription = function stopAdminLiveLocationsSubscriptionPublic() {
  stopAdminLiveLocationsSubscription();
};

window.subscribeAdminLiveLocations = function subscribeAdminLiveLocations(onChange, onError) {
  if (!firebaseAvailable || !db || typeof onChange !== "function") {
    return function noopUnsubscribe() {};
  }
  var user = auth.currentUser;
  if (!user || !currentUserProfile || currentUserProfile.role !== "administrador") {
    console.warn("subscribeAdminLiveLocations: acceso denegado (solo admin).");
    return function noopUnsubscribe() {};
  }

  stopAdminLiveLocationsSubscription();
  adminLiveLocationsUnsubscribe = onSnapshot(
    collection(db, "live_locations"),
    function (snap) {
      var docs = [];
      snap.forEach(function (item) {
        docs.push({ id: item.id, data: item.data() || {} });
      });
      onChange(docs);
    },
    function (err) {
      console.error("Error en live_locations onSnapshot:", err);
      if (typeof onError === "function") onError(err);
    }
  );

  return function unsubscribeLiveLocations() {
    stopAdminLiveLocationsSubscription();
  };
};

async function resolveCurrentUserWithProfile() {
  if (!firebaseAvailable || !auth.currentUser) {
    throw new Error("Debes iniciar sesión para continuar.");
  }
  var user = auth.currentUser;
  var profile = currentUserProfile;
  if (!profile || !profile.role) {
    profile = (await getProfile(user.uid)) || {};
    currentUserProfile = profile;
  }
  return { user: user, profile: profile };
}

window.saveBranchToFirestore = async function saveBranchToFirestore(branchData) {
  if (!firebaseAvailable || !db) {
    throw new Error("Firebase no está disponible.");
  }
  var resolved = await resolveCurrentUserWithProfile();
  if (resolved.profile.role !== "administrador") {
    throw new Error("Solo administradores pueden guardar sucursales.");
  }
  var payload = Object.assign({}, branchData || {});
  var name = String(payload.name || "").trim();
  if (!name) throw new Error("El nombre de la sucursal es obligatorio.");
  var radius = normalizeBranchNumber(payload.geofenceRadius);
  var data = {
    clientId: String(payload.clientId || "").trim(),
    name: name,
    address: String(payload.address || "").trim(),
    contact: String(payload.contact || "").trim(),
    phone: String(payload.phone || "").trim(),
    status: payload.status === "inactive" ? "inactive" : "active",
    lat: normalizeBranchNumber(payload.lat),
    lng: normalizeBranchNumber(payload.lng),
    geofenceRadius: radius && radius > 0 ? Math.round(radius) : 120,
    updatedAt: serverTimestamp(),
  };
  var id = String(payload.id || "").trim();
  if (id) {
    await setDoc(doc(db, "branches", id), data, { merge: true });
    return { id: id, updated: true };
  }
  data.createdAt = serverTimestamp();
  data.createdBy = resolved.user.uid;
  var created = await addDoc(collection(db, "branches"), data);
  return { id: created.id, updated: false };
};

window.deleteBranchFromFirestore = async function deleteBranchFromFirestore(id) {
  if (!firebaseAvailable || !db) {
    throw new Error("Firebase no está disponible.");
  }
  var resolved = await resolveCurrentUserWithProfile();
  if (resolved.profile.role !== "administrador") {
    throw new Error("Solo administradores pueden eliminar sucursales.");
  }
  var safeId = String(id || "").trim();
  if (!safeId) throw new Error("Sucursal inválida.");
  await deleteDoc(doc(db, "branches", safeId));
  return { id: safeId };
};

function cloneChecklistSections(sections) {
  if (!Array.isArray(sections)) return [];
  try {
    return JSON.parse(JSON.stringify(sections));
  } catch (_err) {
    return [];
  }
}

function normalizeChecklistTemplateType(value, checklistName, checklistType) {
  var raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "correctivo") return "correctivo";
  if (raw === "generic" || raw === "generico" || raw === "genérico")
    return "generic";
  var hint =
    (String(checklistName || "") + " " + String(checklistType || "")).toLowerCase();
  if (hint.indexOf("correctivo") !== -1) return "correctivo";
  return "generic";
}

window.saveChecklistToFirestore = async function saveChecklistToFirestore(checklistData) {
  if (!firebaseAvailable || !db) {
    throw new Error("Firebase no está disponible.");
  }
  var resolved = await resolveCurrentUserWithProfile();
  if (resolved.profile.role !== "administrador") {
    throw new Error("Solo administradores pueden guardar checklists.");
  }
  var payload = Object.assign({}, checklistData || {});
  var name = String(payload.name || "").trim();
  if (!name) throw new Error("El nombre del checklist es obligatorio.");
  var data = {
    name: name,
    type: String(payload.type || "General").trim() || "General",
    templateType: normalizeChecklistTemplateType(
      payload.templateType,
      name,
      payload.type
    ),
    published: payload.published === true,
    sections: cloneChecklistSections(payload.sections),
    updatedAt: serverTimestamp(),
  };
  if (!data.sections.length) {
    throw new Error("Agrega al menos una sección al checklist.");
  }
  var id = String(payload.id || "").trim();
  if (id) {
    await setDoc(doc(db, "checklists", id), data, { merge: true });
    return { id: id, updated: true };
  }
  data.createdAt = serverTimestamp();
  data.createdBy = resolved.user.uid;
  var created = await addDoc(collection(db, "checklists"), data);
  return { id: created.id, updated: false };
};

window.deleteChecklistFromFirestore = async function deleteChecklistFromFirestore(id) {
  if (!firebaseAvailable || !db) {
    throw new Error("Firebase no está disponible.");
  }
  var resolved = await resolveCurrentUserWithProfile();
  if (resolved.profile.role !== "administrador") {
    throw new Error("Solo administradores pueden eliminar checklists.");
  }
  var safeId = String(id || "").trim();
  if (!safeId) throw new Error("Checklist inválido.");
  await deleteDoc(doc(db, "checklists", safeId));
  return { id: safeId };
};

window.setChecklistPublishedInFirestore = async function setChecklistPublishedInFirestore(id, published) {
  if (!firebaseAvailable || !db) {
    throw new Error("Firebase no está disponible.");
  }
  var resolved = await resolveCurrentUserWithProfile();
  if (resolved.profile.role !== "administrador") {
    throw new Error("Solo administradores pueden publicar checklists.");
  }
  var safeId = String(id || "").trim();
  if (!safeId) throw new Error("Checklist inválido.");
  await setDoc(
    doc(db, "checklists", safeId),
    {
      published: !!published,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return { id: safeId, published: !!published };
};

window.saveChecklistReportToFirestore = async function saveChecklistReportToFirestore(reportData) {
  if (!firebaseAvailable || !db) {
    throw new Error("Firebase no está disponible.");
  }
  var resolved = await resolveCurrentUserWithProfile();
  var data = Object.assign({}, reportData || {});
  var payload = {
    checklistId: String(data.checklistId || "").trim(),
    checklistName: String(data.checklistName || "").trim() || "Checklist",
    templateType: normalizeChecklistTemplateType(
      data.templateType,
      data.checklistName,
      data.checklistType
    ),
    checklistType: String(data.checklistType || "").trim(),
    folio: String(data.folio || "").trim(),
    technicianId: resolved.user.uid,
    technicianName:
      String(data.technicianName || "").trim() ||
      resolved.profile.name ||
      resolved.user.displayName ||
      resolved.user.email ||
      "Técnico",
    managerName: String(data.managerName || "").trim(),
    clienteNombre: String(data.clienteNombre || "").trim(),
    sucursalNombre: String(data.sucursalNombre || "").trim(),
    fallaReportada: String(data.fallaReportada || "").trim(),
    servicioRealizado: String(data.servicioRealizado || "").trim(),
    materiales: String(data.materiales || "").trim(),
    observaciones: String(data.observaciones || "").trim(),
    answers: data.answers || {},
    photos: Array.isArray(data.photos) ? data.photos.filter(Boolean) : [],
    createdAt: serverTimestamp(),
    location: data.location || null,
    signatureData: data.signatureData || "",
    managerSignatureData: data.managerSignatureData || "",
  };
  if (!payload.checklistId) {
    throw new Error("Checklist inválido para guardar reporte.");
  }
  var created = await addDoc(collection(db, "checklist_reports"), payload);
  return { id: created.id };
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
  payload.templateType = normalizeChecklistTemplateType(
    payload.templateType,
    payload.checklistNombre || payload.checklistName,
    payload.checklistType || payload.tipoMantenimiento
  );
  payload.checklistType = String(payload.checklistType || "").trim();
  payload.folio = String(payload.folio || payload.ordenId || "").trim();
  payload.tecnicoNombre =
    profile.name ||
    payload.tecnicoNombre ||
    user.displayName ||
    user.email ||
    "Técnico";
  payload.clienteNombre = String(payload.clienteNombre || "").trim();
  payload.sucursalNombre = String(payload.sucursalNombre || "").trim();
  payload.gerenteTurno = String(payload.gerenteTurno || "").trim();
  payload.fallaReportada = String(payload.fallaReportada || "").trim();
  payload.servicioRealizado = String(payload.servicioRealizado || "").trim();
  payload.materiales = String(payload.materiales || "").trim();
  payload.firmaTecnico = String(payload.firmaTecnico || payload.signatureData || "").trim();
  payload.firmaGerente = String(payload.firmaGerente || "").trim();
  payload.fecha = serverTimestamp();
  payload.userEmail = user.email || "";
  payload.userRole = profile.role || "";

  console.log("[saveReportToFirestore] Guardando reporte en Firestore:", {
    ordenId: payload.ordenId || "",
    fotos: Array.isArray(payload.fotos) ? payload.fotos.length : 0,
    tecnicoNombre: payload.tecnicoNombre || "",
  });
  var created = await addDoc(collection(db, "reportes"), payload);
  console.log("[saveReportToFirestore] Reporte guardado con id:", created.id);
  return { id: created.id };
};

window.uploadEvidenceImage = async function uploadEvidenceImage(file, context) {
  if (!firebaseAvailable || !storageReady) {
    throw new Error("Firebase Storage no está disponible.");
  }
  if (!file) {
    throw new Error("Archivo inválido.");
  }

  var user = auth.currentUser;
  if (!user) {
    throw new Error("Debes iniciar sesión para subir fotos.");
  }

  var ext = "";
  var dot = file.name ? file.name.lastIndexOf(".") : -1;
  if (dot > -1) ext = file.name.slice(dot).toLowerCase();

  var orderId = (context && context.orderId) || "sin-orden";
  var safeOrderId = String(orderId).replace(/[^a-zA-Z0-9_-]/g, "_");
  var filePath =
    "reportes/" +
    user.uid +
    "/" +
    safeOrderId +
    "/" +
    Date.now() +
    "_" +
    Math.random().toString(36).slice(2, 8) +
    ext;

  var storageRef = ref(storage, filePath);
  console.log("[uploadEvidenceImage] Subiendo archivo a Storage:", {
    path: filePath,
    name: file.name || "",
    size: file.size || 0,
    type: file.type || "",
  });
  await withTimeout(
    uploadBytes(storageRef, file),
    60000,
    "uploadBytes en Firebase Storage"
  );
  console.log("[uploadEvidenceImage] uploadBytes completado:", filePath);
  var downloadUrl = await withTimeout(
    getDownloadURL(storageRef),
    30000,
    "getDownloadURL en Firebase Storage"
  );
  console.log("[uploadEvidenceImage] URL generada correctamente:", downloadUrl);
  return downloadUrl;
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

function compactText(value, max) {
  var text = String(value || "").trim();
  if (!text) return "Sin observaciones";
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function mailToForReport(item) {
  var data = (item && item.data) || {};
  var subject = encodeURIComponent(
    "Reporte " + (data.ordenId || item.id || "sin-folio")
  );
  var body = encodeURIComponent(
    [
      "Hola,",
      "",
      "Comparto el reporte de mantenimiento:",
      "Folio: " + (data.ordenId || item.id || "—"),
      "Tecnico: " + (data.tecnicoNombre || "—"),
      "Fecha: " + formatReportDate(data.fecha),
      "Progreso: " +
        (data.respuestas &&
        data.respuestas.progreso &&
        typeof data.respuestas.progreso.porcentaje === "number"
          ? data.respuestas.progreso.porcentaje + "%"
          : "—"),
      "",
      "Observaciones:",
      data.observaciones || "Sin observaciones",
      "",
      "Saludos.",
    ].join("\n")
  );
  return "mailto:?subject=" + subject + "&body=" + body;
}

function reportProgressLabel(data) {
  return data &&
    data.respuestas &&
    data.respuestas.progreso &&
    typeof data.respuestas.progreso.porcentaje === "number"
    ? data.respuestas.progreso.porcentaje + "%"
    : "—";
}

function hasReportLocation(data) {
  return (
    data &&
    data.ubicacion &&
    typeof data.ubicacion.lat === "number" &&
    typeof data.ubicacion.lng === "number"
  );
}

function formatLocationText(data) {
  if (!hasReportLocation(data)) return "Sin ubicación registrada";
  return (
    data.ubicacion.lat.toFixed(5) + ", " + data.ubicacion.lng.toFixed(5)
  );
}

function buildMapLink(data) {
  if (!hasReportLocation(data)) return "";
  return (
    "https://www.google.com/maps?q=" +
    encodeURIComponent(
      String(data.ubicacion.lat) + "," + String(data.ubicacion.lng)
    )
  );
}

function geocodeAddressLabel(data) {
  if (!hasReportLocation(data)) return Promise.resolve("");
  var key =
    String(data.ubicacion.lat.toFixed(5)) + "," + String(data.ubicacion.lng.toFixed(5));
  if (geocodeCache[key]) return Promise.resolve(geocodeCache[key]);
  var url =
    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
    encodeURIComponent(String(data.ubicacion.lat)) +
    "&lon=" +
    encodeURIComponent(String(data.ubicacion.lng));
  return fetch(url, {
    headers: { Accept: "application/json" },
  })
    .then(function (r) {
      if (!r.ok) throw new Error("geocode failed");
      return r.json();
    })
    .then(function (json) {
      var label =
        (json && (json.display_name || (json.address && json.address.road))) ||
        "";
      geocodeCache[key] = label || "";
      return geocodeCache[key];
    })
    .catch(function () {
      return "";
    });
}

function maybeRenderDashboardWithAddress() {
  if (typeof window.renderDashboard === "function") {
    window.renderDashboard();
  }
}

function renderReportPreviewPanel(item) {
  var container = $("rpt-content");
  if (!container || !item) return;

  var data = item.data || {};
  var checklist = data.checklist && data.checklist.name ? data.checklist.name : "—";
  var tecnico = data.tecnicoNombre || "—";
  var fecha = formatReportDate(data.fecha);
  var progreso = reportProgressLabel(data);
  var observaciones = data.observaciones || "Sin observaciones";
  var fotos = Array.isArray(data.fotos) ? data.fotos.filter(Boolean) : [];
  var locationText = formatLocationText(data);
  var mapUrl = buildMapLink(data);
  var approxAddress =
    data.ubicacion && data.ubicacion.direccionAprox
      ? data.ubicacion.direccionAprox
      : "";
  var fotoHtml = fotos.length
    ? fotos
        .map(function (url) {
          return (
            '<img src="' +
            escapeHtml(url) +
            '" alt="Foto evidencia" style="width:120px;height:120px;object-fit:cover;border-radius:10px;border:1px solid var(--border);">'
          );
        })
        .join("")
    : '<div class="empty" style="padding:14px 8px;">Sin evidencia fotográfica</div>';

  var sections = (data.respuestas && data.respuestas.sections) || [];
  var checklistRows = sections
    .filter(function (sec) {
      return sec.type === "checklist";
    })
    .map(function (sec) {
      var rows = (sec.items || [])
        .map(function (it) {
          return (
            '<div class="rchk">' +
            '<div class="rchk-ic" style="background:' +
            (it.checked ? "#dcfce7" : "#fee2e2") +
            ';color:' +
            (it.checked ? "#166534" : "#991b1b") +
            ';">' +
            (it.checked ? "✓" : "✗") +
            "</div>" +
            '<span style="flex:1;">' +
            escapeHtml(it.text || "Actividad") +
            "</span>" +
            "</div>"
          );
        })
        .join("");
      return (
        '<div class="rst">' +
        escapeHtml(sec.title || "Checklist") +
        "</div>" +
        rows
      );
    })
    .join("");

  var actions =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
    '<button class="btn btn-ghost btn-sm" id="rp-back">← Volver a reportes</button>' +
    '<button class="btn btn-primary btn-sm" id="rp-gen-pdf">⬇ Generar PDF</button>' +
    '<a class="btn btn-ghost btn-sm" id="rp-mailto" href="' +
    mailToForReport(item) +
    '">✉ Enviar por correo</a>' +
    "</div>";

  container.innerHTML =
    actions +
    '<div class="rpt">' +
    '<div class="rpt-head"><div><div class="rpt-brand">MantenPro</div><div class="rpt-sub">Vista previa de reporte</div></div><div class="rpt-badge">FOLIO ' +
    escapeHtml(data.ordenId || item.id) +
    "</div></div>" +
    '<div class="rdiv"></div>' +
    '<div class="rgrid">' +
    '<div class="rf"><div class="rfl">Técnico</div><div class="rfv">' +
    escapeHtml(tecnico) +
    "</div></div>" +
    '<div class="rf"><div class="rfl">Fecha</div><div class="rfv">' +
    escapeHtml(fecha) +
    "</div></div>" +
    '<div class="rf"><div class="rfl">Checklist</div><div class="rfv">' +
    escapeHtml(checklist) +
    "</div></div>" +
    '<div class="rf"><div class="rfl">Progreso</div><div class="rfv">' +
    escapeHtml(progreso) +
    "</div></div>" +
    '<div class="rf"><div class="rfl">Ubicación GPS</div><div class="rfv">' +
    escapeHtml(locationText) +
    (mapUrl
      ? ' · <a href="' +
        escapeHtml(mapUrl) +
        '" target="_blank" rel="noopener">Ver mapa</a>'
      : "") +
    "</div></div>" +
    '<div class="rf"><div class="rfl">Dirección aproximada</div><div class="rfv">' +
    escapeHtml(approxAddress || "No disponible") +
    "</div></div>" +
    "</div>" +
    '<div class="rst">Observaciones</div>' +
    '<div style="background:#f9fafb;border-radius:8px;padding:10px 12px;font-size:12px;color:#334155;line-height:1.45;">' +
    escapeHtml(observaciones) +
    "</div>" +
    '<div class="rdiv"></div>' +
    '<div class="rst">Checklist</div>' +
    (checklistRows ||
      '<div class="empty" style="padding:12px 0;">Sin items de checklist</div>') +
    '<div class="rdiv"></div>' +
    '<div class="rst">Evidencia fotográfica</div>' +
    '<div class="rphotos" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr));">' +
    fotoHtml +
    "</div>" +
    "</div>";

  var backBtn = $("rp-back");
  if (backBtn) {
    backBtn.onclick = function () {
      selectedReportForPreview = null;
      renderReportsInPanel(allLoadedReports);
    };
  }

  var pdfBtn = $("rp-gen-pdf");
  if (pdfBtn) {
    pdfBtn.onclick = async function () {
      var generator =
        typeof window.generateBrisamServicePdf === "function"
          ? window.generateBrisamServicePdf
          : window.createAndStoreReportPdf;
      if (typeof generator !== "function") {
        window.toast && window.toast("⚠️ Generador PDF no disponible");
        return;
      }
      var pdfData = {
        ordenId: data.ordenId || data.folio || item.id,
        folio: data.folio || data.ordenId || item.id,
        fecha: asMillis(data.fecha) ? new Date(asMillis(data.fecha)) : new Date(),
        fechaTexto: fecha,
        tecnicoNombre: data.tecnicoNombre || "",
        gerenteTurno: data.gerenteTurno || data.managerName || "",
        clienteNombre: data.clienteNombre || "No especificado",
        sucursalNombre: data.sucursalNombre || "No especificado",
        tipoMantenimiento: data.tipoMantenimiento || checklist,
        checklistType: data.checklistType || "",
        templateType: data.templateType || data.checklistTemplateType || "",
        checklistNombre:
          (data.checklist && data.checklist.name) || data.checklistName || checklist,
        fallaReportada: data.fallaReportada || "",
        servicioRealizado: data.servicioRealizado || data.descripcionServicio || "",
        materiales: data.materiales || "",
        observaciones: data.observaciones || "",
        respuestas: data.respuestas || data.answers || {},
        photoPreviews: fotos,
        fotos: fotos,
        signatureData: data.signatureData || data.firmaTecnico || "",
        firmaTecnico: data.firmaTecnico || data.signatureData || "",
        firmaGerente: data.firmaGerente || data.managerSignatureData || "",
        ubicacion: data.ubicacion || data.location || null,
      };
      try {
        await generator(pdfData);
        if (typeof window.downloadLastReportPdf === "function") {
          window.downloadLastReportPdf();
        }
      } catch (err) {
        console.error("Error generando PDF desde vista previa:", err);
        window.toast && window.toast("❌ No se pudo generar el PDF");
      }
    };
  }
}

window.openReportPreview = function openReportPreview(reportId) {
  var match = (allLoadedReports || []).find(function (item) {
    return item.id === reportId;
  });
  if (!match) return;
  selectedReportForPreview = match;
  renderReportPreviewPanel(match);
};

function reportDayStart(value) {
  if (!value) return 0;
  var d = new Date(value + "T00:00:00");
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function reportDayEnd(value) {
  if (!value) return 0;
  var d = new Date(value + "T23:59:59");
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function getUniqueTechnicians(reportDocs) {
  var names = {};
  reportDocs.forEach(function (item) {
    var name = (item.data && item.data.tecnicoNombre) || "";
    if (name) names[name] = true;
  });
  return Object.keys(names).sort();
}

function applyReportFilters(reportDocs) {
  var base = reportDocs || [];
  var fromMs = reportDayStart(reportFilters.from);
  var toMs = reportDayEnd(reportFilters.to);
  var tech = reportFilters.tecnico;

  return base
    .filter(function (item) {
      var data = item.data || {};
      var ms = asMillis(data.fecha);
      if (tech && data.tecnicoNombre !== tech) return false;
      if (fromMs && ms && ms < fromMs) return false;
      if (toMs && ms && ms > toMs) return false;
      if ((fromMs || toMs) && !ms) return false;
      return true;
    })
    .sort(function (a, b) {
      return asMillis(b.data.fecha) - asMillis(a.data.fecha);
    });
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

  var filtered = applyReportFilters(reportDocs);
  var showAdminFilters = currentRole === "administrador";
  var technicians = getUniqueTechnicians(reportDocs);
  var filtersHtml =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
    (showAdminFilters
      ? '<select class="fs" id="rp-filter-tech" style="width:220px;">' +
        '<option value="">— Todos los técnicos —</option>' +
        technicians
          .map(function (name) {
            return (
              '<option value="' +
              escapeHtml(name) +
              '"' +
              (reportFilters.tecnico === name ? " selected" : "") +
              ">" +
              escapeHtml(name) +
              "</option>"
            );
          })
          .join("") +
        "</select>"
      : "") +
    '<input class="fi" id="rp-filter-from" type="date" value="' +
    escapeHtml(reportFilters.from) +
    '" style="width:180px;">' +
    '<input class="fi" id="rp-filter-to" type="date" value="' +
    escapeHtml(reportFilters.to) +
    '" style="width:180px;">' +
    '<button class="btn btn-ghost btn-sm" id="rp-filter-clear">Limpiar filtros</button>' +
    '<span class="chip">Orden: más recientes primero</span>' +
    "</div>";

  if (!filtered.length) {
    container.innerHTML =
      filtersHtml +
      '<div class="empty"><div class="empty-ico">📋</div>No hay reportes para esos filtros</div>';
    wireReportFilterEvents(showAdminFilters);
    return;
  }

  var cards = filtered
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
      var locationMeta = hasReportLocation(data)
        ? "📍 " + formatLocationText(data)
        : "📍 Sin ubicación";
      var fotos = Array.isArray(data.fotos) ? data.fotos.filter(Boolean).slice(0, 3) : [];
      var fotosHtml = fotos.length
        ? '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">' +
          fotos
            .map(function (url) {
              return (
                '<img src="' +
                escapeHtml(url) +
                '" alt="Foto evidencia" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">'
              );
            })
            .join("") +
          "</div>"
        : "";

      return (
        '<div class="card" style="cursor:pointer;" data-report-id="' +
        escapeHtml(item.id) +
        '">' +
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
        "<span>" + escapeHtml(locationMeta) + "</span>" +
        "</div>" +
        '<div style="margin-top:10px;font-size:12px;color:var(--muted2);line-height:1.45;">' +
        escapeHtml(compactText(observaciones, 180)) +
        "</div>" +
        fotosHtml +
        '<div class="card-meta"><span class="chip">ID: ' +
        escapeHtml(item.id) +
        "</span></div>" +
        "</div>"
      );
    })
    .join("");

  container.innerHTML = filtersHtml + '<div class="cards">' + cards + "</div>";
  wireReportFilterEvents(showAdminFilters);
  Array.prototype.slice
    .call(container.querySelectorAll("[data-report-id]"))
    .forEach(function (el) {
      el.onclick = function () {
        var rid = el.getAttribute("data-report-id");
        if (rid) window.openReportPreview(rid);
      };
    });
}

function wireReportFilterEvents(showAdminFilters) {
  var fromInput = $("rp-filter-from");
  var toInput = $("rp-filter-to");
  var clearBtn = $("rp-filter-clear");
  var techSelect = $("rp-filter-tech");

  if (showAdminFilters && techSelect) {
    techSelect.onchange = function () {
      reportFilters.tecnico = this.value || "";
      renderReportsInPanel(allLoadedReports);
    };
  }
  if (fromInput) {
    fromInput.onchange = function () {
      reportFilters.from = this.value || "";
      renderReportsInPanel(allLoadedReports);
    };
  }
  if (toInput) {
    toInput.onchange = function () {
      reportFilters.to = this.value || "";
      renderReportsInPanel(allLoadedReports);
    };
  }
  if (clearBtn) {
    clearBtn.onclick = function () {
      reportFilters.tecnico = "";
      reportFilters.from = "";
      reportFilters.to = "";
      renderReportsInPanel(allLoadedReports);
    };
  }
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
      });

    allLoadedReports = docs;
    docs.forEach(function (item) {
      if (
        item &&
        item.data &&
        item.data.ubicacion &&
        !item.data.ubicacion.direccionAprox &&
        hasReportLocation(item.data)
      ) {
        geocodeAddressLabel(item.data).then(function (label) {
          if (label) {
            item.data.ubicacion.direccionAprox = label;
            window.dashboardReportsCache = docs.map(function (dItem) {
              return dItem.data || {};
            });
            maybeRenderDashboardWithAddress();
            if (
              selectedReportForPreview &&
              selectedReportForPreview.id === item.id
            ) {
              renderReportPreviewPanel(item);
            }
            renderReportsInPanel(allLoadedReports);
          }
        });
      }
    });
    window.dashboardReportsCache = docs.map(function (item) {
      return item.data || {};
    });
    if (typeof window.renderDashboard === "function") {
      window.renderDashboard();
    }
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
