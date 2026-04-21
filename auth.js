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
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
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
  tecnico: ["tech", "report"],
  administrador: ["dashboard", "orders", "clients", "branches", "technicians", "equipment", "checklists", "report"]
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
  checklist: "",
  sucursal: "",
  tipo: "",
  from: "",
  to: "",
};
var geocodeCache = {};

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
    syncRuntimeCollectionsForUser(user, currentUserProfile);
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
    '<div class="rpt-head"><div><div class="rpt-brand">BRISAM</div><div class="rpt-sub">Vista previa de reporte</div></div><div class="rpt-badge">FOLIO ' +
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
    pdfBtn.onclick = function () {
      if (typeof window.createAndStoreReportPdf !== "function") {
        window.toast && window.toast("⚠️ Generador PDF no disponible");
        return;
      }
      var pdfData = {
        ordenId: data.ordenId || item.id,
        fecha: asMillis(data.fecha) ? new Date(asMillis(data.fecha)) : new Date(),
        tecnicoNombre: data.tecnicoNombre || "",
        clienteNombre: data.clienteNombre || "Cliente",
        sucursalNombre: data.sucursalNombre || "Sucursal",
        tipoMantenimiento: data.tipoMantenimiento || checklist,
        descripcionServicio: data.observaciones || "",
        respuestas: data.respuestas || {},
        photoPreviews: fotos,
        signatureData: data.signatureData || "",
      };
      try {
        window.createAndStoreReportPdf(pdfData);
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
  (reportDocs || []).forEach(function (item) {
    var name = (item.data && item.data.tecnicoNombre) || "";
    if (name) names[name] = true;
  });
  return Object.keys(names).sort();
}

function getUniqueChecklistNames(reportDocs) {
  var names = {};
  (reportDocs || []).forEach(function (item) {
    var data = item.data || {};
    var checklist = data.checklistNombre || (data.checklist && data.checklist.name) || "";
    if (checklist) names[checklist] = true;
  });
  return Object.keys(names).sort();
}

function getUniqueBranchNames(reportDocs) {
  var names = {};
  (reportDocs || []).forEach(function (item) {
    var branch = (item.data && item.data.sucursalNombre) || "";
    if (branch) names[branch] = true;
  });
  return Object.keys(names).sort();
}

function applyReportFilters(reportDocs) {
  var base = reportDocs || [];
  var fromMs = reportDayStart(reportFilters.from);
  var toMs = reportDayEnd(reportFilters.to);
  var tech = reportFilters.tecnico;
  var checklist = reportFilters.checklist;
  var sucursal = reportFilters.sucursal;
  var tipo = reportFilters.tipo;

  return base
    .filter(function (item) {
      var data = item.data || {};
      var ms = asMillis(data.fecha);
      if (tech && data.tecnicoNombre !== tech) return false;
      var checklistLabel =
        data.checklistNombre ||
        (data.checklist && data.checklist.name) ||
        "";
      if (checklist && checklistLabel !== checklist) return false;
      if (sucursal && (data.sucursalNombre || "") !== sucursal) return false;
      if (tipo && (data.tipo || "orden_asignada") !== tipo) return false;
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
        orderBy: mod.orderBy,
        limit: mod.limit,
      };
    })
    .catch(function (err) {
      console.error("No se pudo cargar API de lectura Firestore:", err);
      return null;
    });

  return firestoreReadApiPromise;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  var parsed = Date.parse(value);
  return isNaN(parsed) ? 0 : parsed;
}

function formatAnyDate(value) {
  var ms = toMillis(value);
  if (!ms) return "—";
  return new Date(ms).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeOrderStatus(value) {
  var raw = String(value || "").toLowerCase();
  if (raw === "done" || raw === "completada" || raw === "completed") return "done";
  if (raw === "progress" || raw === "en_progreso" || raw === "in_progress") return "progress";
  return "pending";
}

async function readCollectionCandidates(readApi, names) {
  if (!readApi || !Array.isArray(names)) return [];
  var firstReadable = [];
  for (var i = 0; i < names.length; i += 1) {
    var colName = names[i];
    try {
      var snap = await readApi.getDocs(collection(db, colName));
      var docs = snap.docs.map(function (d) {
        var data = d.data() || {};
        if (!data.id) data.id = d.id;
        return data;
      });
      if (!firstReadable.length) firstReadable = docs;
      if (docs.length) return docs;
    } catch (_err) {
      // Silencioso: intentamos el siguiente candidato.
    }
  }
  return firstReadable;
}

function mapTechniciansFromUsers(userDocs) {
  return (userDocs || [])
    .filter(function (u) {
      return String((u && u.role) || "").toLowerCase() === "tecnico";
    })
    .map(function (u) {
      var uid = u.uid || u.id || "";
      var online = u.online !== false && String(u.status || "").toLowerCase() !== "offline";
      return {
        id: uid || u.email || Math.random().toString(36).slice(2, 8),
        uid: uid,
        name: u.name || u.nombre || u.email || "Técnico",
        spec: u.especialidad || u.spec || "",
        email: u.email || "",
        phone: u.phone || u.telefono || "",
        status: online ? "active" : "inactive",
        online: online,
      };
    });
}

function mapChecklistDocs(checklistDocs) {
  return (checklistDocs || []).map(function (item) {
    return {
      id: item.id || "",
      name: item.name || item.nombre || "Checklist",
      type: item.type || item.tipo || "General",
      sections: Array.isArray(item.sections)
        ? item.sections
        : Array.isArray(item.secciones)
        ? item.secciones
        : [],
      status: item.status || (item.active === false ? "inactive" : "active"),
      active: item.active !== false && String(item.status || "").toLowerCase() !== "inactive",
    };
  });
}

function mapOrdersDocs(orderDocs) {
  return (orderDocs || []).map(function (o) {
    var createdRef = o.createdAt || o.fecha || o.date;
    return {
      id: o.id || o.folio || "",
      type: o.type || o.tipo || "Orden de trabajo",
      clientId: o.clientId || o.clienteId || "",
      branchId: o.branchId || o.sucursalId || "",
      techId: o.techId || o.tecnicoId || o.tecnicoUid || "",
      techUid: o.techUid || o.tecnicoUid || "",
      clId: o.clId || o.checklistId || (o.checklist && o.checklist.id) || "",
      priority: o.priority || o.prioridad || "Normal",
      desc: o.desc || o.descripcion || "",
      status: normalizeOrderStatus(o.status || o.estado),
      date: o.date || o.fechaTexto || formatAnyDate(createdRef),
      createdAt: createdRef || null,
      updatedAt: o.updatedAt || createdRef || null,
    };
  });
}

function mapClientsDocs(clientDocs) {
  return (clientDocs || []).map(function (c) {
    return {
      id: c.id || "",
      name: c.name || c.nombre || "Cliente",
      contact: c.contact || c.contacto || "",
      phone: c.phone || c.telefono || "",
      email: c.email || "",
      notes: c.notes || c.notas || "",
    };
  });
}

function mapBranchesDocs(branchDocs) {
  return (branchDocs || []).map(function (b) {
    return {
      id: b.id || "",
      clientId: b.clientId || b.clienteId || "",
      name: b.name || b.nombre || "Sucursal",
      address: b.address || b.direccion || "",
      contact: b.contact || b.contacto || "",
      phone: b.phone || b.telefono || "",
      status: b.status || "active",
    };
  });
}

function mapEquipmentDocs(equipmentDocs) {
  return (equipmentDocs || []).map(function (e) {
    return {
      id: e.id || "",
      branchId: e.branchId || e.sucursalId || "",
      name: e.name || e.nombre || "Equipo",
      type: e.type || e.tipo || "",
      brand: e.brand || e.marca || "",
      model: e.model || e.modelo || "",
      year: e.year || e.anio || "",
      status: e.status || "active",
      notes: e.notes || e.notas || "",
    };
  });
}

async function loadRuntimeCollections(readApi, user, profile) {
  if (!readApi || !user) return null;
  var usersDocs = await readCollectionCandidates(readApi, ["users"]);
  var checklistDocs = await readCollectionCandidates(readApi, ["checklists", "checklist"]);
  var orderDocs = await readCollectionCandidates(readApi, ["orders", "ordenes"]);
  var clientDocs = await readCollectionCandidates(readApi, ["clients", "clientes"]);
  var branchDocs = await readCollectionCandidates(readApi, ["branches", "sucursales"]);
  var equipmentDocs = await readCollectionCandidates(readApi, ["equipment", "equipos"]);

  var mappedTechs = mapTechniciansFromUsers(usersDocs);
  if (
    mappedTechs.length &&
    !mappedTechs.some(function (t) {
      return t.uid === user.uid || t.id === user.uid;
    })
  ) {
    mappedTechs.push({
      id: user.uid,
      uid: user.uid,
      name: (profile && profile.name) || user.displayName || user.email || "Técnico",
      spec: (profile && (profile.especialidad || profile.spec)) || "",
      email: user.email || "",
      phone: (profile && (profile.phone || profile.telefono)) || "",
      status: "active",
      online: true,
    });
  }

  return {
    technicians: mappedTechs,
    checklists: mapChecklistDocs(checklistDocs).filter(function (c) {
      return c.active !== false;
    }),
    orders: mapOrdersDocs(orderDocs),
    clients: mapClientsDocs(clientDocs),
    branches: mapBranchesDocs(branchDocs),
    equipment: mapEquipmentDocs(equipmentDocs),
  };
}

function applyRuntimeDataToUi(runtimePayload, user, profile) {
  if (!runtimePayload || !user) return;
  if (typeof window.setFirestoreRuntimeData === "function") {
    window.setFirestoreRuntimeData(runtimePayload);
  }
  if (typeof window.setAuthenticatedTechProfile === "function") {
    window.setAuthenticatedTechProfile({
      uid: user.uid,
      techId: user.uid,
      name: (profile && profile.name) || user.displayName || user.email || "Técnico",
      email: user.email || (profile && profile.email) || "",
      role: (profile && profile.role) || "",
      spec: (profile && (profile.especialidad || profile.spec)) || "",
      online:
        (!profile || profile.online !== false) &&
        String((profile && profile.status) || "").toLowerCase() !== "offline",
    });
  }
}

async function syncRuntimeCollectionsForUser(user, profile) {
  if (!firebaseAvailable || !user) return;
  try {
    var readApi = await getFirestoreReadApi();
    if (!readApi || !readApi.getDocs || !readApi.query || !readApi.where) return;
    var runtimeData = await loadRuntimeCollections(readApi, user, profile || {});
    applyRuntimeDataToUi(runtimeData, user, profile || {});
  } catch (err) {
    console.warn("No se pudo sincronizar runtime collections:", err);
  }
}

function renderReportsInPanel(reportDocs) {
  var container = $("rpt-content");
  if (!container) return;

  var filtered = applyReportFilters(reportDocs);
  var showAdminFilters = currentRole === "administrador";
  var technicians = getUniqueTechnicians(reportDocs);
  var checklistNames = getUniqueChecklistNames(reportDocs);
  var branchNames = getUniqueBranchNames(reportDocs);
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
    (showAdminFilters
      ? '<select class="fs" id="rp-filter-checklist" style="width:240px;">' +
        '<option value="">— Todos los checklist —</option>' +
        checklistNames
          .map(function (name) {
            return (
              '<option value="' +
              escapeHtml(name) +
              '"' +
              (reportFilters.checklist === name ? " selected" : "") +
              ">" +
              escapeHtml(name) +
              "</option>"
            );
          })
          .join("") +
        "</select>"
      : "") +
    (showAdminFilters
      ? '<select class="fs" id="rp-filter-branch" style="width:220px;">' +
        '<option value="">— Todas las sucursales —</option>' +
        branchNames
          .map(function (name) {
            return (
              '<option value="' +
              escapeHtml(name) +
              '"' +
              (reportFilters.sucursal === name ? " selected" : "") +
              ">" +
              escapeHtml(name) +
              "</option>"
            );
          })
          .join("") +
        "</select>"
      : "") +
    (showAdminFilters
      ? '<select class="fs" id="rp-filter-type" style="width:190px;">' +
        '<option value="">— Todos los tipos —</option>' +
        '<option value="orden_asignada"' +
        (reportFilters.tipo === "orden_asignada" ? " selected" : "") +
        '>Órdenes asignadas</option>' +
        '<option value="checklist_libre"' +
        (reportFilters.tipo === "checklist_libre" ? " selected" : "") +
        '>Checklist libres</option>' +
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
      var reportType = String(data.tipo || "orden_asignada") === "checklist_libre" ? "Checklist libre" : "Orden asignada";

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
        "<span>🧾 " + escapeHtml(reportType) + "</span>" +
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
  var checklistSelect = $("rp-filter-checklist");
  var branchSelect = $("rp-filter-branch");
  var typeSelect = $("rp-filter-type");

  if (showAdminFilters && techSelect) {
    techSelect.onchange = function () {
      reportFilters.tecnico = this.value || "";
      renderReportsInPanel(allLoadedReports);
    };
  }
  if (showAdminFilters && checklistSelect) {
    checklistSelect.onchange = function () {
      reportFilters.checklist = this.value || "";
      renderReportsInPanel(allLoadedReports);
    };
  }
  if (showAdminFilters && branchSelect) {
    branchSelect.onchange = function () {
      reportFilters.sucursal = this.value || "";
      renderReportsInPanel(allLoadedReports);
    };
  }
  if (showAdminFilters && typeSelect) {
    typeSelect.onchange = function () {
      reportFilters.tipo = this.value || "";
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
      reportFilters.checklist = "";
      reportFilters.sucursal = "";
      reportFilters.tipo = "";
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

window.loadRuntimeDataForUi = async function loadRuntimeDataForUi() {
  if (!firebaseAvailable || !auth.currentUser) return;
  try {
    var readApi = await getFirestoreReadApi();
    if (!readApi || !readApi.getDocs || !readApi.query || !readApi.where) {
      return;
    }
    var runtimeData = await loadRuntimeCollections(readApi, auth.currentUser, currentUserProfile || {});
    applyRuntimeDataToUi(runtimeData, auth.currentUser, currentUserProfile || {});
  } catch (err) {
    console.warn("No se pudo cargar data runtime:", err);
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
      syncRuntimeCollectionsForUser(user, currentUserProfile || {});
      window.loadReportsIntoPanel();
    }
  });
}
