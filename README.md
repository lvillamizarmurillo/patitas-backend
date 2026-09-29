# PATITAS BACKEND — PLATAFORMA DE ADOPCIÓN Y VENTA DE MASCOTAS 🐾

API REST de la plataforma "Patitas". Conecta adoptantes con refugios, criadores y particulares: publicación de mascotas con galería de fotos, agendamiento de citas en clínicas veterinarias, contratos en PDF, favoritos, verificación de organizaciones y panel de administración.

Es un **monolito modular por dominios** sobre Node.js 22, Express 5 y PostgreSQL 15. Se despliega en **Dokploy** con una sola imagen Docker, las imágenes viven en **Cloudinary**, y el código ya está listo para pasar a **AWS** (RDS + S3 + ECS) sin reescribir lógica de negocio.

---

## 📑 ÍNDICE

1. [Arquitectura y stack](#1-arquitectura-y-stack)
2. [Estructura del proyecto](#2-estructura-del-proyecto)
3. [Desarrollo local](#3-desarrollo-local)
4. [Base de datos: migraciones, seed y admin](#4-base-de-datos-migraciones-seed-y-admin)
5. [Endpoints de la API](#5-endpoints-de-la-api)
6. [Imágenes de las publicaciones](#6-imágenes-de-las-publicaciones)
7. [Seguridad](#7-seguridad)
8. [Despliegue en Dokploy (paso a paso)](#8-despliegue-en-dokploy-paso-a-paso)
9. [Backups de la base de datos](#9-backups-de-la-base-de-datos)
10. [Operación: actualizar, revertir y diagnosticar](#10-operación-actualizar-revertir-y-diagnosticar)
11. [Migración futura a AWS](#11-migración-futura-a-aws)
12. [Roadmap](#12-roadmap)

---

## 1. ARQUITECTURA Y STACK

| Capa | Tecnología | Notas |
| --- | --- | --- |
| Runtime | Node.js 22 LTS (Alpine) | Node 20 salió de soporte en abril de 2026. |
| Framework | Express 5 | Captura errores de funciones `async` sin `try/catch` en cada controlador. |
| Base de datos | PostgreSQL 15 + Sequelize 6 | Esquema versionado con migraciones (nunca `sync()`). |
| Validación | Zod | Todo `body`/`query`/`params` pasa por un schema; lo validado queda en `req.valid`. |
| Autenticación | JWT (15 min) + refresh token rotativo en cookie `httpOnly` | Refresh tokens guardados como SHA-256, con detección de reutilización. |
| Imágenes | Multer (memoria) + Sharp → Cloudinary / S3 | WebP, máx 1600 px, sin EXIF/GPS. En la BD solo se guarda la URL. |
| PDF | Puppeteer Core + Chromium del sistema + EJS | Contratos de adopción, generados tras el commit de la transacción. |
| Correo | Nodemailer (SMTP) | Opcional: sin `SMTP_HOST` no envía nada y no rompe el flujo. |
| Logs | Pino + pino-http | JSON estructurado, con contraseñas y tokens redactados. |
| Infraestructura | Docker multi-stage → Dokploy (Traefik + Let's Encrypt) | La misma imagen corre después en AWS ECS. |

**Flujo de cada petición:** `Ruta → validate(schema Zod) → Controller (delgado) → Service (reglas de negocio, transacciones) → DTO (qué campos salen)`. Los errores se lanzan con `AppError` desde el service y `error.middleware.js` los normaliza a:

```json
{ "error": { "code": "BAD_REQUEST", "message": "...", "details": [] }, "requestId": "uuid" }
```

Las respuestas exitosas siempre tienen la forma `{ "data": ..., "meta"?: ... }`.

---

## 2. ESTRUCTURA DEL PROYECTO

```
├── server.js                  # Arranque + graceful shutdown (SIGTERM/SIGINT)
├── Dockerfile                 # Multi-stage: development / production (última etapa)
├── docker-compose.yml         # Node + Postgres para desarrollo local
├── scripts/
│   ├── start-prod.js          # CMD de producción: valida env → aplica migraciones → arranca
│   └── create-admin.js        # Crea o promueve el admin real (sin el seed de demo)
├── migrations/                # Esquema versionado (se aplican en orden)
├── seeders/                   # Datos de demo (bloqueados en producción)
└── src/
    ├── app.js                 # Helmet, CORS, rate limit global, health checks, rutas
    ├── routes/index.js        # Monta todos los routers de src/modules
    ├── config/                # env (validación Zod), database, logger, sequelize-cli
    ├── models/                # Modelos + index.js con TODAS las asociaciones
    ├── middlewares/           # auth, validate, upload, rate-limit, error, not-found
    ├── providers/storage/     # cloudinary | s3 | local (mismo contrato: upload/remove/getSignedUrl)
    ├── queue/                 # Generación de contratos (inline hoy, SQS mañana)
    ├── utils/                 # AppError, schemas Zod comunes, mailer, escape
    └── modules/
        ├── auth/              # registro, login, refresh, logout, perfil, contraseñas
        ├── pets/              # CRUD de publicaciones + galería/padres
        ├── appointments/      # citas con bloqueo de fila y máquina de estados
        ├── contracts/         # PDF del contrato + URL firmada
        ├── favorites/         # favoritos por usuario
        ├── catalogs/          # razas, ciudades y clínicas para filtros
        ├── dashboard/         # métricas del publicador
        ├── admin/             # verificación de organizaciones, usuarios, citas
        ├── newsletter/        # suscripción pública al boletín
        └── support/           # formulario "Escríbenos"
```

Cada módulo trae sus propios `*.routes.js`, `*.schemas.js`, `*.controller.js`, `*.service.js` y, si expone datos, `*.dto.js`. Un módulo nuevo se registra en `src/routes/index.js` y sus modelos en `src/models/index.js`.

### Modelo de datos

| Tabla | Para qué | Relaciones |
| --- | --- | --- |
| `Users` | Cuentas (`adopter`, `shelter`, `breeder`, `individual`, `admin`). Soft delete. | 1→N Pets, Appointments, Favorites, RefreshTokens |
| `Pets` | Publicaciones. `imageUrl` = portada. Soft delete. | N→1 User (owner), 1→N PetImages |
| `PetImages` | Galería (1-3) + foto de madre + foto de padre. | N→1 Pet |
| `VetClinics` | Clínicas donde se hace la entrega. | 1→N Appointments |
| `Appointments` | Citas. Índice único parcial: una sola cita activa por mascota. | N→1 Pet, User, VetClinic |
| `Contracts` | PDF del contrato (clave en storage + SHA-256). | 1→1 Appointment |
| `Favorites` | Favoritos (único por usuario+mascota). | N→1 User, Pet |
| `RefreshTokens` | Sesiones (hash SHA-256, rotación, revocación). | N→1 User |
| `PasswordResetTokens` | Enlaces de recuperación (hash, 1 h, un solo uso). | N→1 User |
| `NewsletterSubscribers` | Correos del boletín. | — |
| `SupportMessages` | Mensajes de "Escríbenos". | N→1 User (opcional) |

---

## 3. DESARROLLO LOCAL

Requisitos: Docker Desktop (con WSL2 en Windows) y Git. Node 22 solo si quieres correr scripts fuera del contenedor.

> En Windows con WSL, clona el repo dentro del filesystem de Linux (`~/proyectos/...`), no en `/mnt/c` ni `/mnt/d`: el hot reload y la velocidad de `npm` son mucho peores ahí.

```bash
cp .env.example .env        # y completa DB_PASSWORD, JWT_SECRET, CLOUDINARY_URL...
openssl rand -hex 48        # usa la salida como JWT_SECRET
bash docker-compose.sh      # levanta Node (hot reload) + Postgres y sigue los logs
docker compose exec app sh -c "npm run migrate && npm run seed"
```

- API: `http://localhost:3000/api/v1`
- Postgres queda publicado solo en `127.0.0.1:5433`, para conectarte con DBeaver o pgAdmin desde tu máquina.
- Sin Cloudinary puedes usar `STORAGE_DRIVER=local`: las imágenes se sirven desde `/uploads`. Es solo para desarrollo.
- Sin SMTP no salen correos. En `NODE_ENV=development` el enlace de recuperación de contraseña se imprime en el log.

---

## 4. BASE DE DATOS: MIGRACIONES, SEED Y ADMIN

No se usa `sync()`: el esquema vive en `migrations/`. **Nunca edites una migración ya aplicada.** Crea una nueva con timestamp mayor, por ejemplo `20260201000000-add-algo.js`.

| Comando | Qué hace |
| --- | --- |
| `npm run migrate` | Aplica las migraciones pendientes. En producción corre solo al arrancar el contenedor. |
| `npm run migrate:status` | Muestra qué migraciones están aplicadas. |
| `npm run migrate:undo` | Revierte la última migración. |
| `npm run seed` | Datos de demo. **Bloqueado cuando `NODE_ENV=production`.** |
| `npm run create-admin` | Crea (o promueve) el admin real con las variables `ADMIN_*`. |

Usuarios del seed de demo (solo en local):

| Correo | Contraseña | Rol |
| --- | --- | --- |
| `admin@patitas.app` | `Admin2026Seguro!` | admin |
| `hola@refugiopatasunidas.org` | `Refugio2026!` | shelter (verificado) |
| `ana@correo.com` | `Adoptante2026!` | adopter |

Crear el admin en cualquier entorno. La contraseña necesita mínimo 12 caracteres, una mayúscula y un número:

```bash
ADMIN_EMAIL=tu@correo.com ADMIN_PASSWORD='Una-Clave-Larga-2026' ADMIN_NAME='Tu Nombre' npm run create-admin
```

---

## 5. ENDPOINTS DE LA API

Base URL: `http://localhost:3000/api/v1` (local) · `https://api.tudominio.com/api/v1` (producción)

Éxito: `{ "data": ..., "meta"?: ... }`. Error: `{ "error": { code, message, details }, "requestId" }`. Endpoints autenticados: header `Authorization: Bearer <accessToken>`.

### 5.1. Sistema
| Método | Endpoint | Descripción |
| --- | --- | --- |
| GET | `/health` | Vida del servidor. |
| GET | `/ready` | Conexión a la BD activa. |

### 5.2. Auth (`/auth`)
| Método | Endpoint | Descripción |
| --- | --- | --- |
| POST | `/auth/register` | Registro; devuelve `accessToken` + cookie `refreshToken` httpOnly. |
| POST | `/auth/login` | Login (rate limit: 10 fallos/15min). |
| POST | `/auth/refresh` | Rota el refresh token y entrega un nuevo access token. |
| POST | `/auth/logout` | Revoca el refresh token actual. |
| GET | `/auth/me` | Perfil del usuario autenticado. |
| PATCH | `/auth/me` | Edita `fullName`, `city`, `phone` y/o `email` (al menos uno). Cambiar `email` exige `currentPassword`. |
| PATCH | `/auth/me/password` | Cambia la contraseña (`currentPassword`, `newPassword`) y cierra las demás sesiones. |
| POST | `/auth/forgot-password` | Envía un enlace de recuperación (vence en 1h). Siempre responde 200. Rate limit: 3/h por IP. |
| POST | `/auth/reset-password` | Aplica `newPassword` con el `token` del enlace y revoca todas las sesiones. Rate limit: 10/h por IP. |

### 5.3. Mascotas (`/pets`)
| Método | Endpoint | Descripción |
| --- | --- | --- |
| GET | `/pets` | Lista con filtros `city`, `breed`, `filter` (`adopcion`/`cachorros`/`criador`), `page`, `limit`. Cada `owner` incluye `isVerified`. |
| GET | `/pets/mine` | Mascotas publicadas por el usuario autenticado. |
| GET | `/pets/:id` | Detalle por UUID, con `images: [{ id, url, kind, sortOrder }]` (`kind`: `gallery`/`mother`/`father`). |
| POST | `/pets` | Publica una mascota (roles `shelter`, `breeder`, `individual`). FormData con `gallery` (1-3 archivos, obligatorio), `motherPhoto` y `fatherPhoto` (obligatorios). Máx 5 imágenes. La primera de la galería queda como `imageUrl` (portada). |
| PATCH | `/pets/:id` | Edita (solo el dueño). Imágenes opcionales: `gallery` reemplaza toda la galería; `motherPhoto`/`fatherPhoto` reemplazan solo esa foto. |
| DELETE | `/pets/:id` | Elimina (solo el dueño, y solo si no tiene cita activa). |

### 5.4. Citas (`/appointments`)
| Método | Endpoint | Descripción |
| --- | --- | --- |
| POST | `/appointments` | Solicita cita. `meetingDate` debe ser >1h en el futuro. |
| GET | `/appointments` | Citas del usuario (como adoptante o como dueño de la mascota). |
| GET | `/appointments/:id` | Detalle (usado por la pantalla de seguimiento). |
| PATCH | `/appointments/:id/status` | Cambia estado, regido por la máquina de estados. |

### 5.5. Favoritos (`/favorites`)
| Método | Endpoint | Descripción |
| --- | --- | --- |
| GET | `/favorites` | Lista de mascotas favoritas del usuario. |
| POST | `/favorites/:id` | Agrega la mascota `:id` a favoritos. |
| DELETE | `/favorites/:id` | La quita de favoritos. |

### 5.6. Admin (`/admin`) — solo rol `admin`
| Método | Endpoint | Descripción |
| --- | --- | --- |
| GET | `/admin/organizations?status=pending` | Lista refugios/criadores por estado de verificación. |
| PATCH | `/admin/organizations/:id/verify` | Verifica una organización (envía correo si SMTP está configurado). |
| PATCH | `/admin/organizations/:id/revoke` | Revoca la verificación. |
| GET | `/admin/users?role=&search=&page=&limit=` | Usuarios paginados; `search` busca en nombre y correo. |
| GET | `/admin/appointments?status=&page=&limit=` | Todas las citas del sistema con `pet` (+`owner`), `clinic` y `adopter`. |

### 5.7. Dashboard (`/dashboard`)
| Método | Endpoint | Descripción |
| --- | --- | --- |
| GET | `/dashboard` | Métricas del refugio, criador o particular (`individual`) autenticado. |

### 5.8. Catálogos (`/catalogs`)
| Método | Endpoint | Descripción |
| --- | --- | --- |
| GET | `/catalogs/filters` | Razas y ciudades en uso. |
| GET | `/catalogs/clinics?city=` | Clínicas activas. |

### 5.9. Contratos (`/contracts`)
| Método | Endpoint | Descripción |
| --- | --- | --- |
| GET | `/contracts/:appointmentId` | URL firmada temporal (5 min) para descargar el PDF del contrato. |

### 5.10. Newsletter (`/newsletter`) — público
| Método | Endpoint | Descripción |
| --- | --- | --- |
| POST | `/newsletter/subscribe` | `{ email }`. Idempotente (un correo repetido responde 200). Rate limit: 5/h por IP. |
| POST | `/newsletter/unsubscribe` | `{ email }`. Da de baja; no revela si el correo existía. |

### 5.11. Soporte (`/support`) — público, sesión opcional
| Método | Endpoint | Descripción |
| --- | --- | --- |
| POST | `/support/contact` | `{ name?, email?, message }`. Con sesión, `name`/`email` salen del usuario si no se envían. Guarda en `SupportMessages` y reenvía a `SUPPORT_EMAIL`. Rate limit: 5/h por IP. |

---

## 6. IMÁGENES DE LAS PUBLICACIONES

**Regla de negocio:** cada publicación lleva **1 a 3 fotos de la mascota**, **1 foto de la madre** y **1 foto del padre**. Las tres categorías son obligatorias al crear, con un **máximo de 5 imágenes**.

| Campo del FormData | Cantidad | Al crear | Al editar |
| --- | --- | --- | --- |
| `gallery` | 1 a 3 | Obligatorio | Opcional. Si llega, **reemplaza toda la galería**. |
| `motherPhoto` | 1 | Obligatorio | Opcional. Reemplaza solo esa foto. |
| `fatherPhoto` | 1 | Obligatorio | Opcional. Reemplaza solo esa foto. |

- Formatos aceptados: JPG, PNG o WEBP de máximo 5 MB cada uno. El servidor revisa el contenido real con Sharp, no solo la extensión.
- Todas se convierten a WebP (máx 1600 px) y se les quitan los metadatos (EXIF/GPS).
- `imageUrl` de la mascota es la **primera foto de la galería** (portada para tarjetas y listados).
- `GET /pets/:id` devuelve `images: [{ id, url, kind, sortOrder }]`, ordenadas: galería → madre → padre. `kind` vale `gallery`, `mother` o `father`.
- Si una subida falla a mitad de camino, se borran del storage las que ya habían subido. Las imágenes reemplazadas o de mascotas eliminadas también se borran.

Ejemplo desde el frontend:

```js
const fd = new FormData();
fd.append('name', 'Luna'); fd.append('breed', 'Beagle'); fd.append('ageMonths', '3'); fd.append('city', 'Bogotá');
fotos.forEach((f) => fd.append('gallery', f));   // 1 a 3
fd.append('motherPhoto', fotoMadre);
fd.append('fatherPhoto', fotoPadre);
await fetch(`${API}/pets`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
```

**Dónde se guardan:** en Cloudinary (plan gratuito: 25 GB). Cambiar a S3 es solo configurar `STORAGE_DRIVER=s3` + `S3_BUCKET` + `CDN_DOMAIN`. Como las imágenes no viven en el contenedor, **no se pierden al reiniciar ni al redesplegar**.

---

## 7. SEGURIDAD

Lo que ya trae el backend:

**Autenticación y sesiones**
- Contraseñas con bcrypt (factor 12), mínimo 8 caracteres con mayúscula y número (12 para el admin). El login compara contra un hash falso cuando el usuario no existe, para no revelar qué correos están registrados por diferencias de tiempo.
- Access token JWT de 15 min (HS256, `issuer` fijo). El `JWT_SECRET` debe tener ≥ 32 caracteres; en producción se rechazan valores que parezcan de ejemplo.
- El refresh token viaja en una cookie `httpOnly` + `Secure` + `SameSite`, limitada al path `/api/v1/auth`. En la BD se guarda solo su SHA-256. Rota en cada uso, y si alguien reutiliza uno viejo (señal de robo) se revocan todas las sesiones del usuario.
- Cambiar la contraseña cierra las demás sesiones. Recuperarla por correo cierra todas.
- Cambiar el correo del perfil exige la contraseña actual.
- Recuperación de contraseña: token aleatorio de 256 bits, guardado como hash, válido 1 hora y de un solo uso. Pedir uno nuevo invalida el anterior, y la respuesta es idéntica exista o no el correo.

**Entrada y salida de datos**
- Zod valida todo lo que entra, lo que evita inyección de campos (*mass assignment*). Por ejemplo, nadie puede auto-asignarse `role: admin`.
- Los DTO controlan qué sale: nunca se devuelve `password` (el `defaultScope` del modelo lo excluye).
- Búsquedas con `ILIKE` con los comodines escapados. Sequelize parametriza todas las consultas.
- El texto del usuario se escapa antes de ir a correos HTML. La plantilla del contrato usa `<%= %>`, que también escapa.
- Chromium genera el PDF con JavaScript desactivado y sin acceso a red.
- Límites de tamaño: JSON de 10 KB e imágenes de 5 MB con límite de píxeles (evita "bombas" de descompresión).

**Abuso y red**
- Rate limit global (300 peticiones / 15 min por IP) y límites propios por superficie:

| Endpoint | Límite por IP |
| --- | --- |
| login | 10 intentos fallidos / 15 min |
| registro | 5 / hora |
| subida de publicaciones | 20 / hora |
| citas | 30 / hora |
| olvidé mi contraseña | 3 / hora |
| restablecer contraseña | 10 / hora |
| newsletter | 5 / hora |
| soporte | 5 / hora |

- `TRUST_PROXY` hace que el rate limit use la IP real detrás de Traefik (y de Cloudflare, si está delante).
- CORS con lista explícita de orígenes. En producción solo `https://` y nunca `*`.
- Helmet: HSTS de 2 años, CSP `default-src 'none'`, `X-Frame-Options`, `nosniff` y `Referrer-Policy`. Toda respuesta de `/api/v1` lleva `Cache-Control: no-store`.
- Los contratos PDF (con datos personales) se suben como recursos **privados** y solo se entregan con una URL firmada de 5 minutos, únicamente al dueño o al adoptante de esa cita.

**Contenedor y configuración**
- La imagen corre con el usuario `node` (no root) y el código queda de solo lectura dentro del contenedor.
- `tini` como PID 1: las señales llegan bien y hay *graceful shutdown*.
- `npm ci --omit=dev`: se instalan exactamente las versiones del lock, sin dependencias de desarrollo.
- Al arrancar se validan todas las variables de entorno. En producción la app **no levanta** si CORS no es https, si `STORAGE_DRIVER=local` o si `JWT_SECRET` parece de ejemplo.
- El seed de demo, con contraseñas públicas, está bloqueado en producción. El admin real se crea con `create-admin`.
- Los logs redactan `Authorization`, cookies, contraseñas y tokens.

**Pendiente o recomendado** (ver [roadmap](#12-roadmap)): verificación de correo al registrarse, suspensión de cuentas desde admin, 2FA para admins y escaneo de dependencias en CI (`npm audit`). La única alerta abierta de `npm audit` es `uuid` (moderada), que viene dentro de Sequelize. Este proyecto no usa la función afectada (`v3/v5/v6` con buffer) y se resuelve cuando Sequelize actualice.

---

## 8. DESPLIEGUE EN DOKPLOY (PASO A PASO)

### 8.1. Cómo queda montado

```
Internet ──HTTPS──▶ Traefik (Dokploy, certificados Let's Encrypt)
                        │
                        ▼
              patitas-api (contenedor, puerto 3000)  ──▶ Cloudinary (imágenes y PDFs)
                        │  red interna de Docker
                        ▼
              patitas-db (PostgreSQL 15, volumen persistente)  ──backup diario──▶ bucket S3 externo (R2/B2/S3)
```

- **Base de datos:** PostgreSQL 15 como servicio **Database** de Dokploy. Dokploy guarda los datos en un **volumen de Docker**, así que **sobreviven a reinicios, redeploys, actualizaciones de la app e incluso reinicios del servidor**. Solo se pierden si borras el servicio de base de datos o el servidor entero, y para eso están los backups de la [sección 9](#9-backups-de-la-base-de-datos).
- **La base NO se expone a internet.** La app se conecta por la red interna de Docker.
- **Imágenes y PDFs** viven en Cloudinary, fuera del servidor.

### 8.2. Preparar el servidor (una sola vez)

1. **VPS** con Ubuntu 22.04/24.04. Mínimo 2 GB de RAM (Chromium para los PDF consume); lo recomendado son 4 GB.
2. **Instalar Dokploy** siguiendo la guía oficial (`https://docs.dokploy.com`).
3. **DNS:** crea un registro `A` apuntando a la IP del servidor para la API (ej. `api.tudominio.com`). Si el panel de Dokploy tendrá dominio propio, crea otro (ej. `panel.tudominio.com`).
4. **Firewall:** deja abiertos solo `22` (SSH), `80` y `443`. Cuando el panel tenga dominio con HTTPS, cierra el `3000` (el puerto del panel).
   ```bash
   ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
   ```
   ⚠️ Docker puede saltarse `ufw` para los puertos que publica un contenedor. Por eso la base de datos **no** debe tener puerto externo (paso 8.4).
5. **Cuenta de Dokploy:** contraseña fuerte y 2FA activado (perfil de usuario).
6. **Recomendado:** SSH solo con llave (`PasswordAuthentication no`) y actualizaciones automáticas de seguridad (`unattended-upgrades`).

### 8.3. Crear el proyecto

Panel de Dokploy → **Projects** → **Create Project** → nombre `patitas`.

### 8.4. Crear la base de datos (PostgreSQL)

1. Dentro del proyecto → **Create Service** → **Database** → **PostgreSQL**.
2. Completa los campos:
   - **Name:** `patitas-db`
   - **Database Name:** `patitas`
   - **Database User:** `patitas`
   - **Database Password:** genera una fuerte (`openssl rand -base64 32`).
   - **Docker Image:** `postgres:15` (la misma versión mayor que en desarrollo).
3. **Create**, y después **Deploy**.
4. En la pestaña general del servicio copia la **Internal Connection URL**. Tiene la forma `postgresql://patitas:CLAVE@<nombre-interno>:5432/patitas` y es la que usará la app.
5. **No configures "External Port".** Si algún día necesitas entrar con DBeaver, usa un túnel SSH:
   ```bash
   ssh -L 5433:localhost:5432 usuario@servidor
   ```
   También puedes habilitar el puerto externo solo durante esa sesión y quitarlo al terminar.

### 8.5. Crear la aplicación (API)

1. **Settings → Git:** conecta tu cuenta de GitHub (instala la GitHub App de Dokploy y dale acceso solo a este repositorio).
2. En el proyecto → **Create Service** → **Application** → nombre `patitas-api`.
3. Pestaña **General → Provider:** GitHub, repositorio `puppymarket`, rama `main`.
4. **Build Type:** `Dockerfile`, con estos valores:
   - **Docker File:** `Dockerfile`
   - **Docker Context Path:** `.`
   - **Docker Build Stage:** `production`. Si el campo no aparece, no pasa nada: `production` es la última etapa y se construye por defecto.
5. **Save.**

### 8.6. Variables de entorno

Pestaña **Environment** de `patitas-api`. Pega esto y reemplaza los valores:

```env
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

DATABASE_URL=postgresql://patitas:CLAVE@NOMBRE-INTERNO:5432/patitas
DB_SSL=false

JWT_SECRET=pega_aqui_la_salida_de_openssl_rand_hex_48
JWT_EXPIRES_IN=15m

CORS_ORIGINS=https://app.tudominio.com
FRONTEND_URL=https://app.tudominio.com
TRUST_PROXY=1
COOKIE_SAMESITE=strict

STORAGE_DRIVER=cloudinary
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=no-reply@tudominio.com
SUPPORT_EMAIL=soporte@tudominio.com

RUN_MIGRATIONS=true
```

| Variable | Qué poner | Por qué |
| --- | --- | --- |
| `DATABASE_URL` | La **Internal Connection URL** del paso 8.4. | La conexión va por la red interna de Docker. |
| `DB_SSL` | `false` | La conexión es interna al servidor. Pon `true` solo si usas una BD gestionada externa (RDS, Neon…). |
| `JWT_SECRET` | Salida de `openssl rand -hex 48`. | Si cambia, todas las sesiones se invalidan. |
| `CORS_ORIGINS` | URL(s) `https://` del frontend, separadas por coma. | En producción la app no levanta con `http://` ni `*`. |
| `FRONTEND_URL` | URL `https://` del frontend. | Base del enlace de "restablecer contraseña". |
| `TRUST_PROXY` | `1`. Pon `2` si Cloudflare (nube naranja) está delante. | Para que el rate limit vea la IP real. |
| `COOKIE_SAMESITE` | Ver la nota de abajo. | Si queda mal, el refresh de sesión no funciona. |
| `CLOUDINARY_URL` | Cloudinary → Dashboard → "API Environment variable". | Obligatoria con `STORAGE_DRIVER=cloudinary`. |
| `SMTP_*` | Gmail (contraseña de aplicación), Brevo, Resend, SES… | Sin esto no salen correos (recuperación, verificación, soporte). |
| `SUPPORT_EMAIL` | Buzón que recibe "Escríbenos". | Vacío = los mensajes solo se guardan en la BD. |

> **Front y API en el mismo dominio o en distintos:**
> - Si el front está en `app.tudominio.com` y la API en `api.tudominio.com`, son el mismo sitio → `COOKIE_SAMESITE=strict` (lo más seguro).
> - Si el front está en otro dominio (ej. `patitas.vercel.app`) → `COOKIE_SAMESITE=none`. Si no, el navegador no enviará la cookie del refresh token.
> - En ambos casos el frontend debe llamar a `/auth/refresh` con `credentials: 'include'`.

Después de guardar, **nunca subas estos valores al repositorio**: `.env` está en `.gitignore` y `.dockerignore`.

### 8.7. Dominio y HTTPS

Pestaña **Domains** → **Add Domain**:
- **Host:** `api.tudominio.com`
- **Path:** `/`
- **Container Port:** `3000`
- **HTTPS:** activado
- **Certificate:** Let's Encrypt

Traefik emite y renueva el certificado solo. El DNS del paso 8.2 ya debe apuntar al servidor.

### 8.8. Primer deploy

1. Pulsa **Deploy** y sigue el log en **Deployments**.
2. Al arrancar, el contenedor:
   1. valida las variables de entorno (si falta algo, el log dice exactamente qué y la app no levanta);
   2. aplica las migraciones pendientes (`▶ Aplicando migraciones pendientes...`);
   3. arranca la API (`🚀 API en puerto 3000`).
3. Verifica:
   ```bash
   curl https://api.tudominio.com/health
   curl https://api.tudominio.com/ready
   ```
   La primera debe responder `{"status":"ok"}` y la segunda `{"status":"ready"}` (la BD responde).

### 8.9. Crear el administrador

Abre una terminal dentro del contenedor de `patitas-api`, desde la opción **Terminal** del servicio en Dokploy o por SSH con `docker exec -it <contenedor> sh`, y ejecuta:

```bash
ADMIN_EMAIL=tu@correo.com ADMIN_PASSWORD='Una-Clave-Larga-2026' ADMIN_NAME='Tu Nombre' node scripts/create-admin.js
```

⚠️ No corras `npm run seed` en producción: está bloqueado a propósito porque crea usuarios con contraseñas publicadas en este README.

### 8.10. Deploy automático en cada push

En la pestaña **General** de `patitas-api` activa **Autodeploy**. Desde entonces, cada `git push` a `main` construye y despliega solo, y las migraciones nuevas se aplican al arrancar.

### 8.11. Recursos (recomendado)

En **Advanced → Resources** limita la API, por ejemplo a 1 GB de memoria. Así un pico de Chromium no tumba el servidor ni la base de datos.

---

## 9. BACKUPS DE LA BASE DE DATOS

El volumen de Docker protege los datos frente a reinicios, pero **no** frente a un borrado accidental, un disco dañado o la pérdida del VPS. Para eso Dokploy saca **backups automáticos programados** de PostgreSQL y los sube a un bucket compatible con S3 **fuera del servidor**.

### 9.1. Crear el bucket de destino

Cualquier almacenamiento compatible con S3 sirve. Opciones económicas:

| Proveedor | Gratis | Nota |
| --- | --- | --- |
| Cloudflare R2 | 10 GB | Sin costo de descarga. Recomendado. |
| Backblaze B2 | 10 GB | Muy barato después. |
| AWS S3 | 5 GB (12 meses) | Útil si luego migran a AWS. |

1. Crea un bucket **privado**, por ejemplo `patitas-backups`.
2. Crea una API key con permiso **solo sobre ese bucket** (lectura y escritura).
3. Anota Access Key, Secret Key, Region y Endpoint. En R2 la región es `auto` y el endpoint es `https://<account-id>.r2.cloudflarestorage.com`.

### 9.2. Registrar el destino en Dokploy

**Settings → S3 Destinations → Add Destination** → completa nombre, Access Key, Secret Key, Bucket, Region y Endpoint → **Test connection** → **Save**.

### 9.3. Programar el backup automático

En el servicio `patitas-db` → pestaña **Backups** → **Create Backup**:

| Campo | Valor sugerido |
| --- | --- |
| Destination | el destino del paso 9.2 |
| Database | `patitas` |
| Schedule (cron) | `0 8 * * *` → todos los días a las 08:00 UTC (3:00 a. m. en Colombia) |
| Prefix | `patitas/` |
| Keep the latest | `14` (dos semanas de historial; los más viejos se borran solos) |
| Enabled | ✅ |

Pulsa **Test** o **Run now** para sacar el primero de inmediato y confirma que el archivo aparece en el bucket.

> Para más historial sin gastar mucho, crea un segundo backup semanal (`0 9 * * 0`) con otro prefijo (`patitas-semanal/`) y `Keep the latest = 8`.

### 9.4. Restaurar un backup

- **Desde Dokploy:** en la pestaña **Backups** de `patitas-db`, la opción **Restore** permite elegir un archivo del bucket (disponible en versiones recientes de Dokploy).
- **Manual** (sirve siempre). Descarga el archivo del bucket al servidor y:
  ```bash
  # 1. Detén la API para que nadie escriba durante la restauración (Stop en Dokploy)
  # 2. Copia el backup al contenedor de la BD y restaura
  docker cp backup.sql.gz <contenedor-db>:/tmp/
  docker exec -it <contenedor-db> sh -c "gunzip -c /tmp/backup.sql.gz | psql -U patitas -d patitas"
  # Si el archivo es formato custom (.dump):
  docker exec -it <contenedor-db> pg_restore -U patitas -d patitas --clean --if-exists --no-owner /tmp/backup.dump
  # 3. Vuelve a iniciar la API (Deploy/Start en Dokploy)
  ```
- **Backup manual puntual**, por ejemplo antes de una migración delicada:
  ```bash
  docker exec <contenedor-db> pg_dump -U patitas -d patitas -Fc > patitas-$(date +%F).dump
  ```

✅ **Prueba una restauración una vez al mes** en una base temporal (`createdb -U patitas prueba_restore` + `pg_restore -d prueba_restore`). Un backup que nunca se probó no es un backup.

---

## 10. OPERACIÓN: ACTUALIZAR, REVERTIR Y DIAGNOSTICAR

**Actualizar:** `git push` a `main`. Con Autodeploy, Dokploy construye la imagen nueva, aplica migraciones y reemplaza el contenedor.

**Revertir código:** en **Deployments** puedes volver a desplegar una versión anterior, o hacer `git revert` y push. Si la versión mala traía una migración, revierte también la migración desde la terminal del contenedor (`npm run migrate:undo`), o restaura el backup previo.

**Diagnóstico rápido:**

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| El contenedor se reinicia y el log dice `❌ Variables de entorno inválidas` | Falta o es inválida una variable | El log lista cuál; corrígela en Environment y redespliega. |
| `/ready` responde 503 | La API no llega a la BD | Revisa `DATABASE_URL` (debe ser la *Internal* URL) y que `patitas-db` esté corriendo. |
| El login funciona pero la sesión se cae a los 15 min | La cookie del refresh no viaja | Revisa `COOKIE_SAMESITE` (8.6), HTTPS y `credentials: 'include'` en el front. |
| Error de CORS en el navegador | El origen del front no está en `CORS_ORIGINS` | Agrega la URL exacta (con `https://`, sin `/` final). |
| Todos los usuarios comparten el rate limit | La API ve la IP del proxy | Ajusta `TRUST_PROXY` (2 si hay Cloudflare delante). |
| No llegan correos | SMTP sin configurar o credenciales mal | Revisa `SMTP_*`; los fallos quedan en el log como `warn`. |
| Falla la generación del contrato | Poca memoria para Chromium | Sube el límite de memoria del servicio (≥ 1 GB). |

Los logs salen en JSON en la pestaña **Logs** del servicio. Cada respuesta de error trae un `requestId` para buscarla.

---

## 11. MIGRACIÓN FUTURA A AWS

Es solo configuración; no hay que tocar código:

- **RDS PostgreSQL** reemplaza a `patitas-db`: cambia `DATABASE_URL` y pon `DB_SSL=true`. Para migrar los datos, restaura un backup de la sección 9 en RDS.
- **S3 + CloudFront** reemplazan a Cloudinary: `STORAGE_DRIVER=s3`, `S3_BUCKET`, `CDN_DOMAIN`, `AWS_REGION`. Los permisos van por IAM Task Role, sin access keys. El SDK ya viene instalado.
- **ECS Fargate** corre la misma imagen (`production`). `HEALTHCHECK`, `/health`, `/ready` y el graceful shutdown ya están listos para el ALB.
- **SQS** (opcional): con `CONTRACT_QUEUE_URL` los contratos se encolan para un worker aparte.

---

## 12. ROADMAP

✅ Refresh tokens con rotación y detección de reutilización
✅ Storage desacoplado (Cloudinary / S3 / local)
✅ Generación de contratos fuera de la transacción (lista para SQS)
✅ Verificación de organizaciones con notificación por correo
✅ Favoritos
✅ Editar perfil y cambio de contraseña
✅ Recuperación de contraseña por correo
✅ Newsletter y formulario "Escríbenos"
✅ Galería (1-3) + fotos de madre y padre
✅ Insignia de vendedor verificado
✅ Panel admin: usuarios y citas
✅ Dashboard para particulares (`individual`)
✅ Despliegue en Dokploy con migraciones automáticas, backups programados y endurecimiento de seguridad

⏳ **Pendiente**
1. **Suspender usuarios desde admin** (`PATCH /admin/users/:id/suspend`): requiere una columna `suspendedAt` en `Users` y validarla en login/refresh.
2. **Verificación de correo al registrarse** y **2FA para cuentas admin**.
3. **Tests automatizados** (Jest + Supertest ya están en devDependencies) y CI con `npm audit`.
4. **OpenAPI/Swagger** generado desde los schemas Zod (`@asteasolutions/zod-to-openapi`).
5. **Worker aparte para Puppeteer** cuando el tráfico lo justifique (la interfaz `contract-queue.js` ya está lista).
6. **Limpieza periódica** de `PasswordResetTokens` y `RefreshTokens` vencidos.
