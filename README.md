# REPORTES-BRISAM

## Publicar en Firebase Hosting

### 1) Requisitos

- Tener Node.js instalado.
- Tener Firebase CLI instalado:

```bash
npm install -g firebase-tools
```

- Iniciar sesión:

```bash
firebase login
```

### 2) Archivos de deploy incluidos

Este proyecto ya incluye:

- `firebase.json`
- `.firebaseignore`

La configuración usa la raíz del proyecto (`"."`) como carpeta pública porque la app es estática y su entrada principal es `index.html`.

### 3) Asociar proyecto Firebase (una sola vez)

Desde la carpeta del proyecto:

```bash
firebase use --add
```

Selecciona el proyecto Firebase correcto (el mismo donde ya usas Auth/Firestore/Storage).

> Esto creará `.firebaserc` automáticamente con el alias del proyecto.

### 4) Deploy

Publicar únicamente Hosting:

```bash
firebase deploy --only hosting
```

Al terminar, Firebase mostrará la URL pública (ejemplo: `https://tu-proyecto.web.app`).

### 5) Validar que siga funcionando Auth / Firestore / Storage

En Firebase Console revisa:

1. **Authentication**
   - Agrega el dominio de Hosting en **Authorized domains** (`tu-proyecto.web.app` y/o `tu-proyecto.firebaseapp.com`).
2. **Firestore Database**
   - Reglas activas y colección `reportes` disponible.
3. **Storage**
   - Bucket configurado y reglas que permitan el flujo autenticado.

La app ya usa las credenciales en `firebase-config.js`, por lo que no requiere cambios adicionales para funcionar en Hosting.

### 6) Instalar en tablets (PWA básico)

Una vez online:

- Abre la URL en Chrome (Android) o Safari (iPad).
- Usa **Agregar a pantalla de inicio**.

> Nota: para experiencia PWA completa (modo app nativo, íconos, splash), el siguiente paso es agregar `manifest.webmanifest` y service worker.

## Logos (principal y favicon)

Para personalizar branding en la app:

1. Coloca tus imágenes en una carpeta `assets/`:
   - `assets/logo-main.png` (logo principal, imagen 2)
   - `assets/favicon.png` (favicon, imagen 1)

2. El `index.html` ya está preparado para tomarlas de esas rutas.

Si tus nombres son diferentes, solo actualiza esas rutas en:

- `<link rel="icon" href="...">`
- `<img id="brand-logo-main" src="...">`
- `<img id="brand-logo-auth" src="...">`
