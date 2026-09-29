# PATITAS BACKEND - SISTEMA DE ADOPCIONES 🐾

Backend de nivel empresarial para la plataforma de adopción de mascotas "Patitas". Construido bajo una arquitectura de **Monolito Modular Orientado a Dominios** utilizando Node.js, Express 5 y PostgreSQL.

El sistema garantiza alta disponibilidad, seguridad estricta de datos (validaciones Zod, Rate Limiting, Sanitización de imágenes, Refresh Tokens con rotación) y un flujo de desarrollo robusto con migraciones y contenedores. Hoy corre sobre infraestructura gratuita/económica (Railway o Render + Cloudinary), y todo el código ya está preparado para migrar a AWS (RDS, S3, ECS) el día que el proyecto lo justifique, sin reescribir nada.

---

## 📑 ÍNDICE

1. [ARQUITECTURA Y STACK TECNOLÓGICO](#1-arquitectura-y-stack-tecnológico)
2. [ESTRUCTURA DE DIRECTORIOS Y ARCHIVOS](#2-estructura-de-directorios-y-archivos)
3. [INSTALACIÓN Y CONFIGURACIÓN](#3-instalación-y-configuración)
4. [BASE DE DATOS: MIGRACIONES Y SEEDERS](#4-base-de-datos-migraciones-y-seeders)
5. [ENDPOINTS DE LA API](#5-endpoints-de-la-api)
6. [ESTRATEGIA DE ALMACENAMIENTO DE IMÁGENES](#6-estrategia-de-almacenamiento-de-imágenes)
7. [DESPLIEGUE (RAILWAY/RENDER HOY, AWS MAÑANA)](#7-despliegue-railwayrender-hoy-aws-mañana)
8. [ROADMAP CUMPLIDO Y PENDIENTE](#8-roadmap-cumplido-y-pendiente)

---

## 1. ARQUITECTURA Y STACK TECNOLÓGICO

- **Runtime & Framework:** Node.js 20 (Alpine), Express 5 (manejo nativo de promesas y errores asíncronos, sin `try/catch` repetido en cada controlador).
- **Base de Datos & ORM:** PostgreSQL 15, Sequelize (con CLI para Migraciones y Seeders). Soporta tanto variables sueltas (`DB_HOST`, `DB_USER`...) como una única `DATABASE_URL` (formato que entregan Railway/Render).
- **Seguridad:** JWT de vida corta (access token) + Refresh Tokens con rotación y detección de robo (Bcryptjs factor 12), Helmet, Express-Rate-Limit, cookies `httpOnly`.
- **Validación de Datos (DTOs):** Zod (*strict schema parsing* para evitar *mass assignment* e inyecciones).
- **Logging:** Pino & Pino-HTTP (JSON estructurado, listo para cualquier agregador de logs).
- **Procesamiento de Archivos:** Multer (memoria) + Sharp (conversión a WebP, redimensionado, eliminación de metadatos EXIF/GPS). **Solo se guarda el link de la imagen en la base de datos, nunca el binario.**
- **Almacenamiento de imágenes:** Patrón *Strategy* (`STORAGE_DRIVER`) — hoy Cloudinary (gratis), con Amazon S3 ya implementado y listo para activar.
- **Generación de Documentos:** Puppeteer Core + EJS (contratos de adopción en PDF, generados de forma asíncrona tras `afterCommit`).
- **Infraestructura:** Docker nativo (multi-stage build), pensado para Railway/Render hoy y AWS ECS sin cambios de código el día de mañana.

---

## 2. ESTRUCTURA DE DIRECTORIOS Y ARCHIVOS

Código organizado por **dominios de negocio**, no por capas técnicas (no hay `controllers/` ni `routes/` globales — cada módulo trae los suyos).

### Archivos raíz

- **`server.js`**: arranca la app, valida la conexión a la BD y maneja *graceful shutdown* (`SIGTERM`/`SIGINT`) para que ECS o cualquier orquestador pueda reiniciar el contenedor sin cortar peticiones a la mitad.
- **`docker-compose.yml`** / **`docker-compose.sh`**: levantan Node + Postgres en desarrollo.
- **`Dockerfile`**: multi-stage (`development` / `production`), incluye Chromium para Puppeteer.
- **`.sequelizerc`**: le dice al CLI de Sequelize dónde están migraciones, seeders y config.

### `src/config/`

- **`env.js`**: valida TODAS las variables de entorno con Zod al arrancar. Si falta una o el `JWT_SECRET` es débil, la app no levanta — evita descubrir configuraciones rotas en producción.
- **`database.js`**: instancia de Sequelize; soporta `DATABASE_URL` (Railway/Render/RDS) o variables sueltas (Docker local).
- **`logger.js`**: Pino, redacta contraseñas y tokens de los logs.
- **`sequelize-cli.js`**: puente de credenciales para `npm run migrate`/`seed`.

### `src/models/`

- **`index.js`**: centraliza TODAS las relaciones (`hasMany`, `belongsTo`) entre `User`, `Pet`, `PetImage`, `VetClinic`, `Appointment`, `Contract`, `Favorite`, `RefreshToken`, `PasswordResetToken`, `NewsletterSubscriber` y `SupportMessage`.
- Cada modelo usa `paranoid: true` (soft delete) donde aplica y *hooks* de Sequelize (ej. hashear password en `User`).

### `src/middlewares/`

- **`auth.middleware.js`**: valida el JWT (`authMiddleware`) y los roles (`requireRole`).
- **`validate.middleware.js`**: pasa `body`/`query`/`params` por Zod y deja la data limpia en `req.valid`.
- **`error.middleware.js`**: normaliza errores de Sequelize/Multer/Zod a un JSON consistente.
- **`rate-limit.middleware.js`**: límites por endpoint (login, registro, uploads, citas).
- **`upload.middleware.js`**: Multer en memoria (`petImages`: campos `gallery` 1-3, `motherPhoto`, `fatherPhoto`; máx 5 archivos de 5 MB) + Sharp (WebP, máx 1600px, sin metadatos).

### `src/providers/storage/`

Patrón *Strategy*: `index.js` elige el proveedor según `STORAGE_DRIVER`.
- **`cloudinary.provider.js`**: activo hoy (plan gratuito).
- **`s3.provider.js`**: implementado y listo, inactivo hasta que se defina `STORAGE_DRIVER=s3`.
- **`local.provider.js`**: solo para desarrollo sin conexión a internet.

Los tres exponen el mismo contrato (`upload`, `remove`, `getSignedUrl`), así que el resto de la app nunca sabe ni le importa cuál está activo.

### `src/queue/`

- **`contract-queue.js`**: abstrae "encolar la generación del contrato PDF". Hoy lo ejecuta inline (mismo proceso); si se define `CONTRACT_QUEUE_URL` (una cola SQS), lo despacha a un worker aparte sin tocar el resto del código.

### `src/utils/`

- **`AppError.js`**: errores HTTP predecibles (`AppError.notFound()`, etc.).
- **`schemas.js`**: validadores Zod reutilizables (UUID, etc.).
- **`mailer.js`**: envío de correo vía SMTP/SES. Si no hay `SMTP_HOST` configurado, simplemente no envía nada — no rompe el flujo.

### `src/routes/index.js`

Punto único que monta todos los routers de `src/modules/*`. **Sin este archivo la app no arranca** — si ves `Cannot find module './routes'`, este es el primer archivo a revisar.

### `src/modules/` — la capa de negocio

Cada módulo sigue **Ruta → Schema (Zod) → Controller → Service**:

- **`auth/`**: registro, login, refresh token con rotación (detección de robo por reutilización), logout, `/me` (ver y editar perfil), cambio de contraseña y recuperación por correo.
- **`pets/`**: CRUD completo (crear, listar, detalle, editar, eliminar, "mis mascotas"), con `Op.iLike` para búsquedas. Cada publicación lleva galería (1-3 fotos) + foto de la madre + foto del padre en la tabla `PetImages`.
- **`appointments/`**: agendamiento con transacción SQL + bloqueo de fila (`FOR UPDATE`) para evitar doble reserva; máquina de estados estricta (`pending → confirmed/cancelled → completed/cancelled`).
- **`contracts/`**: genera el PDF (Puppeteer + EJS) cuando una cita pasa a `completed`, y expone descarga vía URL firmada temporal.
- **`favorites/`**: guardar/quitar mascotas favoritas por usuario.
- **`admin/`**: verificación de refugios/criadores (`isVerified`), listado de usuarios y de todas las citas; acceso restringido al rol `admin`.
- **`dashboard/`**: métricas del publicador (refugio, criador o particular) en 4 consultas paralelas (`Promise.all`).
- **`newsletter/`**: suscripción pública e idempotente al boletín de la landing.
- **`support/`**: formulario "Escríbenos"; guarda el mensaje y lo reenvía a `SUPPORT_EMAIL`.
- **`catalogs/`**: razas, ciudades y clínicas para los filtros del frontend.

---

## 3. INSTALACIÓN Y CONFIGURACIÓN

### 3.1. Clonar y ubicar el proyecto en el filesystem de WSL (no en `/mnt/c` o `/mnt/d`)

```bash
git clone https://github.com/lvillamizarmurillo/patitas-backend.git ~/proyectos/patitas-backend
cd ~/proyectos/patitas-backend
```

### 3.2. Variables de entorno (`.env`, solo para desarrollo local)

```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

DB_HOST=db
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=una_contraseña_segura_local
DB_NAME=patitas_db
DB_SSL=false

JWT_SECRET=minimo_32_caracteres_para_produccion_cambia_esto
JWT_EXPIRES_IN=15m

CORS_ORIGINS=http://localhost:5173,http://localhost:3000
FRONTEND_URL=http://localhost:5173   # base de los links de los correos

STORAGE_DRIVER=cloudinary
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=no-reply@patitas.app
SUPPORT_EMAIL=                      # destino de "Escríbenos" (vacío = solo se guarda en BD)
```

Sin `SMTP_HOST` no se envían correos. En `NODE_ENV=development` el enlace de recuperación de contraseña se imprime en el log para poder probar el flujo.

### 3.3. Levantar

```bash
bash docker-compose.sh
```

Antes de correrlo, verifica siempre que **todos** los archivos de `src/modules/*` y `src/routes/index.js` existan en disco (ver sección de checklist más abajo) — es la causa #1 de crashes en este proyecto.

---

## 4. BASE DE DATOS: MIGRACIONES Y SEEDERS

No se usa `sync()`: el esquema vive en migraciones versionadas.

```bash
docker compose exec app sh -c "npm run migrate && npm run seed"
```

| Comando | Qué hace |
| --- | --- |
| `npm run migrate` | Crea todas las tablas, índices y el índice único parcial que evita doble reserva de una mascota. |
| `npm run migrate:undo` | Revierte la última migración. |
| `npm run seed` | Inserta un refugio verificado, una adoptante, un admin y clínicas/mascotas de prueba (contraseñas reales, hasheadas). |

Usuarios de prueba tras el seed:
- `admin@patitas.app` / `Admin2026Seguro!` (rol `admin`)
- `hola@refugiopatasunidas.org` / `Refugio2026!` (rol `shelter`, ya verificado)
- `ana@correo.com` / `Adoptante2026!` (rol `adopter`)

---

## 5. ENDPOINTS DE LA API

Base URL local: `http://localhost:3000/api/v1`

Todos los endpoints devuelven `{ "data": {}, "meta"?: {}, "requestId": "uuid" }`.

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

## 6. ESTRATEGIA DE ALMACENAMIENTO DE IMÁGENES

**Se guarda únicamente el link de la imagen (`imageUrl` + `imageKey`) en la base de datos — nunca el archivo binario.**

| Etapa | Proveedor | Costo | Por qué |
| --- | --- | --- | --- |
| **Ahora** | Cloudinary | Gratis (25 GB almacenamiento + 25 GB banda/mes) | Sin tarjeta, sin cuenta AWS, con optimización automática de imágenes. |
| **Crecimiento medio** | Cloudinary (plan pago) | Desde unos pocos dólares/mes | Solo se sube de plan, cero cambios de código. |
| **Escala / AWS** | Amazon S3 + CloudFront | Centavos por GB | Se activa cambiando `STORAGE_DRIVER=s3` y las variables `AWS_REGION`/`S3_BUCKET`/`CDN_DOMAIN` — el código ya está implementado y probado en `s3.provider.js`. |

El contrato (`upload`, `remove`, `getSignedUrl`) es idéntico en los tres proveedores, así que ningún controlador ni servicio conoce ni le importa cuál está activo.

---

## 7. DESPLIEGUE (RAILWAY/RENDER HOY, AWS MAÑANA)

### Hoy — Railway o Render

1. Conecta el repo, selecciona el `Dockerfile` con `target: production`.
2. Agrega el addon de PostgreSQL — te entrega `DATABASE_URL` automáticamente (ya soportado sin configuración extra).
3. Define en las variables de entorno del servicio (no en un `.env` del repo): `JWT_SECRET`, `CLOUDINARY_URL`, `CORS_ORIGINS` (con el dominio real del frontend), `DB_SSL=true`.
4. Ejecuta `npm run migrate && npm run seed` una sola vez desde la consola del servicio.

### Mañana — AWS

- **RDS** reemplaza al Postgres de Railway: solo cambia `DATABASE_URL` (o las variables sueltas) en Secrets Manager.
- **S3 + CloudFront** reemplaza a Cloudinary: `STORAGE_DRIVER=s3` + variables de S3, IAM Task Role (sin access keys en texto plano).
- **ECS Fargate** ejecuta la misma imagen Docker (`target: production`) que ya usas hoy — el `HEALTHCHECK`, el *graceful shutdown* y los health checks `/health`/`/ready` ya están listos para el ALB.

Nada de esto requiere reescribir código de negocio: es exclusivamente configuración e infraestructura.

---

## 8. ROADMAP CUMPLIDO Y PENDIENTE

✅ **Refresh Tokens con rotación** — implementado (`RefreshToken` model, detección de reutilización con revocación en cascada).
✅ **Storage desacoplado (Cloudinary/S3/local)** — implementado con patrón Strategy.
✅ **Desacoplamiento de generación de PDF** — implementado vía `t.afterCommit` + `contract-queue.js` (listo para SQS cuando se necesite un worker aparte).
✅ **Verificación de organizaciones + notificación por correo** — implementado (`admin` module + `mailer.js`, SMTP opcional).
✅ **Favoritos** — implementado.
✅ **Editar perfil y cambio de contraseña** — `PATCH /auth/me` y `PATCH /auth/me/password`.
✅ **Recuperación de contraseña** — `PasswordResetToken` (SHA-256, 1h, un solo uso) + revocación de sesiones.
✅ **Newsletter** — `NewsletterSubscriber`, endpoint público idempotente.
✅ **Formulario "Escríbenos"** — `SupportMessage` + correo a `SUPPORT_EMAIL`.
✅ **Galería + fotos de los padres** — tabla `PetImages` (galería 1-3 + madre + padre, máx 5).
✅ **Insignia de vendedor verificado** — `owner.isVerified` en las respuestas de mascotas.
✅ **Admin: usuarios y citas** — `GET /admin/users` y `GET /admin/appointments`.
✅ **Dashboard para `individual`** — ya no recibe 403.

⏳ **Pendiente**
1. **Worker real para Puppeteer**: hoy el PDF se genera en el mismo contenedor (fuera de la transacción, así que no bloquea la respuesta al usuario). El día que el tráfico lo justifique, mover a un servicio Fargate separado consumiendo de SQS — la interfaz (`contract-queue.js`) ya está lista para ese cambio.
2. **OpenAPI/Swagger**: documentar cada endpoint a partir de los schemas Zod ya existentes con `@asteasolutions/zod-to-openapi`.
3. **Suspender usuarios desde admin** (`PATCH /admin/users/:id/suspend`): requiere columna `suspendedAt` en `Users` y validarla en login/refresh.
4. **2FA**: verificación de correo electrónico obligatoria en el registro (hoy solo se envía notificación al verificar una organización, no hay flujo de verificación de email del adoptante).
4. **Tests automatizados**: Jest + Supertest sobre auth, la máquina de estados de citas y la carrera de doble reserva.