# PATITAS BACKEND - SISTEMA DE ADOPCIONES 🐾

Backend de nivel empresarial para la plataforma de adopción de mascotas "Patitas". Construido bajo una arquitectura de **Monolito Modular Orientado a Dominios** utilizando Node.js, Express 5 y PostgreSQL.

El sistema garantiza alta disponibilidad, seguridad estricta de datos (validaciones Zod, Rate Limiting, Sanitización de imágenes) y un flujo de desarrollo robusto con migraciones y contenedores, listo para desplegarse en entornos *cloud-native* como AWS ECS.

---

## 📑 ÍNDICE

1. [ARQUITECTURA Y STACK TECNOLÓGICO](#1-arquitectura-y-stack-tecnológico)
2. [ESTRUCTURA DE DIRECTORIOS Y ARCHIVOS](#2-estructura-de-directorios-y-archivos)
3. [INSTALACIÓN Y CONFIGURACIÓN](#3-instalación-y-configuración)
4. [BASE DE DATOS: MIGRACIONES Y SEEDERS](#4-base-de-datos-migraciones-y-seeders)
5. [ENDPOINTS DE LA API](#5-endpoints-de-la-api)
6. [PRÓXIMAS CARACTERÍSTICAS Y ROADMAP](#6-próximas-características-y-roadmap)

---

## 1. ARQUITECTURA Y STACK TECNOLÓGICO

- **Runtime & Framework:** Node.js 20 (Alpine), Express 5 (Manejo nativo de promesas y errores asíncronos).
- **Base de Datos & ORM:** PostgreSQL 15, Sequelize (con CLI para Migraciones y Seeders).
- **Seguridad:** JWT (JSON Web Tokens), Bcryptjs (Factor 12), Helmet, Express-Rate-Limit.
- **Validación de Datos (DTOs):** Zod (Strict schema parsing para evitar *mass assignment* e inyecciones).
- **Logging:** Pino & Pino-HTTP (Logging estructurado JSON ideal para CloudWatch/Datadog).
- **Procesamiento de Archivos:** Multer (Memoria) + Sharp (Optimización WebP, redimensionamiento y eliminación metadatos EXIF/GPS).
- **Generación de Documentos:** Puppeteer Core + EJS (Generación de contratos de adopción en formato PDF).
- **Infraestructura:** Docker nativo (Multi-stage build).

---

## 2. ESTRUCTURA DE DIRECTORIOS Y ARCHIVOS

El código está organizado por **dominios de negocio**, abandonando el patrón MVC tradicional. Cada módulo es independiente.

### ARCHIVOS RAÍZ Y CONFIGURACIÓN

- **`server.js`**: Punto de entrada de la aplicación. Autentica la base de datos, inicia el servidor HTTP y maneja el **Graceful Shutdown** interceptando señales `SIGTERM/SIGINT` para cerrar conexiones limpiamente antes de que el contenedor muera.
- **`docker-compose.yml`**: Orquesta el contenedor de Node.js y la base de datos PostgreSQL en una red local privada para desarrollo.
- **`Dockerfile`**: Receta multi-stage. Crea imágenes ligeras, instala Chromium para Puppeteer y separa el entorno de desarrollo del de producción.
- **`.sequelizerc`**: Le indica a Sequelize CLI dónde encontrar las carpetas de migraciones, seeders y la configuración de la BD.
- **`.dockerignore` / `.gitignore`**: Evitan que secretos (`.env`) o dependencias pesadas (`node_modules`) se suban al repositorio o al contenedor.

### CARPETA `src/`

Código fuente principal de la aplicación.

#### `src/config/` — CONFIGURACIONES BASE

- **`env.js`**: Validador estricto de variables de entorno usando Zod. Si falta una variable o el `JWT_SECRET` es muy corto, la app no arranca.
- **`database.js`**: Instancia de Sequelize. Configura el pool de conexiones y el dialecto de Postgres.
- **`logger.js`**: Instancia de Pino. Oculta (redacta) contraseñas y tokens en los logs por seguridad.
- **`sequelize-cli.js`**: Puente de credenciales para ejecutar comandos de migración.

#### `src/models/` — CAPA DE DATOS

- **`index.js`**: El archivo más importante de esta carpeta. **Centraliza todas las relaciones** (`hasMany`, `belongsTo`) entre modelos.
- **`User.js` / `Pet.js` / `VetClinic.js` / `Appointment.js` / `Contract.js`**: Definición de las tablas, tipos de datos, validaciones intrínsecas y *Hooks* (ej. encriptar password `beforeCreate` en User). Utilizan `paranoid: true` para borrado lógico (*Soft Delete*).

#### `src/middlewares/` — INTERCEPTORES

- **`auth.middleware.js`**: Extrae el JWT, lo valida y protege rutas (`authMiddleware`). También verifica permisos (`requireRole`).
- **`validate.middleware.js`**: Intercepta `req.body`, `req.query` y `req.params`, los pasa por Zod y guarda la data limpia y validada en `req.valid`.
- **`error.middleware.js`**: Captura cualquier error de la app. Normaliza errores de Sequelize, Multer o Zod, evitando que la app se caiga y devolviendo un JSON limpio.
- **`rate-limit.middleware.js`**: Define límites de peticiones (ej. máximo 5 registros por hora, máximo 10 intentos de login) para mitigar ataques DDoS o de fuerza bruta.
- **`upload.middleware.js`**: Usa Multer para recibir la imagen en memoria y Sharp para convertirla a WebP, bajarle el peso (<300 KB) y quitar datos GPS.

#### `src/providers/` — INYECCIÓN DE DEPENDENCIAS

- **`storage/`**: Implementa el patrón *Strategy*. Dependiendo de `STORAGE_DRIVER` en el `.env`, sube imágenes localmente (`local.provider.js`), a Cloudinary o a Amazon S3, manteniendo el controlador de Mascotas agnóstico e intacto.

#### `src/utils/`

- **`AppError.js`**: Clase personalizada para manejar errores HTTP predecibles (ej. `AppError.notFound()`, `AppError.unauthorized()`).
- **`schemas.js`**: Validadores genéricos reciclables (ej. expresiones regulares para validar UUIDs v4 correctos).

### `src/modules/` — LA CAPA DE NEGOCIO

Cada módulo sigue el flujo:

**Ruta → Validador (Schema) → Controlador → Servicio**

- **`auth/`**: Maneja registro, login (comparando con Hash Señuelo para evitar ataques de *timing*) y generación de JWT.
- **`pets/`**: Lógica de publicación y búsqueda. El servicio aplica condiciones `Op.iLike` para búsquedas e incluye datos del `owner`.
- **`appointments/`**: Sistema crítico de agendamiento. El servicio usa **Transacciones SQL y Bloqueos de Fila (`FOR UPDATE`)** para evitar que dos usuarios reserven la misma mascota al mismo tiempo. Implementa una máquina de estados estricta (`pending → confirmed → completed`).
- **`contracts/`**: Una vez una cita es `completed`, inyecta los datos de la mascota y los usuarios en `templates/contract.ejs` y usa `pdf.service.js` (Puppeteer) para crear el contrato PDF.
- **`dashboard/`**: Ejecuta `Promise.all` para hacer 4 consultas en paralelo y devolver las métricas completas al panel del refugio.
- **`catalogs/`**: Agrupa información (clínicas, razas, ciudades) para los filtros visuales del frontend.

---

## 3. INSTALACIÓN Y CONFIGURACIÓN

### 3.1. Clonar el repositorio

```bash
git clone https://github.com/lvillamizarmurillo/patitas-backend.git
cd patitas-backend
```

### 3.2. Configurar variables de entorno

Crea un archivo `.env` en la raíz. El sistema validará su existencia.

```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
DB_HOST=db
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=una_contraseña_segura_aqui
DB_NAME=patitas_db
DB_SSL=false
JWT_SECRET=tu_secreto_super_seguro_patitas_2026_minimo_32_caracteres
JWT_EXPIRES_IN=24h
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
STORAGE_DRIVER=local
```

### 3.3. Levantar la infraestructura

```bash
# Construye la imagen y levanta Postgres + Node (Nodemon vigila los cambios)
docker compose up --build -d
```

---

## 4. BASE DE DATOS: MIGRACIONES Y SEEDERS

El proyecto no utiliza `sync()` en producción para evitar pérdida de datos. La base de datos se gestiona mediante el CLI de Sequelize.

### 4.1. Entrar al contenedor de la aplicación

```bash
docker compose exec app sh
```

### 4.2. Ejecutar comandos de base de datos

```bash
# Ejecutar todas las migraciones (Crea tablas e índices)
npm run migrate

# Deshacer la última migración (si te equivocas)
npm run migrate:undo

# Insertar datos de prueba (Usuarios con bcrypt, Mascotas, Clínicas)
npm run seed
```

---

## 5. ENDPOINTS DE LA API

Base URL local:

`http://localhost:3000/api/v1`

Todos los endpoints devuelven el formato:

```json
{
  "data": {},
  "meta": {},
  "requestId": "uuid"
}
```

### 5.1. SISTEMA Y MONITOREO

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/health` | Chequeo rápido de vida del servidor (Usado por AWS ALB). |
| `GET` | `/ready` | Verifica si la conexión a PostgreSQL está activa. |

### 5.2. AUTENTICACIÓN (`/auth`)

| Método | Endpoint | Descripción | Requisitos de Validación (Zod) |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Registro de usuario. | Body: `role` (enum), `fullName`, `city`, `email`, `phone`, `password` (8+ chars, Mayúsc, Núm), `termsAccepted` (true). |
| `POST` | `/auth/login` | Inicio de sesión. Devuelve JWT. | Body: `email`, `password`. (Rate limit estricto: 10 fallos/15min). |
| `GET` | `/auth/me` | Verifica perfil actual. | Headers: `Authorization: Bearer <token>` |

### 5.3. MASCOTAS (`/pets`)

| Método | Endpoint | Descripción | Parámetros / Requisitos |
| --- | --- | --- | --- |
| `GET` | `/pets` | Lista mascotas disponibles. | Query: `city`, `breed`, `filter` (adopción, cachorros, criador), `page`, `limit`. |
| `GET` | `/pets/:id` | Detalle de mascota por UUID. | Params: `id` (Debe ser UUID válido). |
| `POST` | `/pets` | Publica una mascota con foto. | Headers: Auth. Solo roles `shelter`, `breeder`, `individual`. FormData: Datos mascota + file `image`. |

### 5.4. CITAS (`/appointments`)

| Método | Endpoint | Descripción | Parámetros / Requisitos |
| --- | --- | --- | --- |
| `POST` | `/appointments` | Solicita una cita (adoptante). | Headers: Auth. Body: `petId`, `clinicId`, `meetingDate` (> 1h futuro). |
| `GET` | `/appointments` | Lista las citas vinculadas. | Headers: Auth. Devuelve citas hechas por el usuario o solicitadas a sus mascotas. |
| `PATCH` | `/appointments/:id/status` | Actualiza el estado. | Headers: Auth. Body: `status` (`confirmed`, `cancelled`, `completed`). Regido por máquina de estados. |

### 5.5. DASHBOARD DE REFUGIOS (`/dashboard`)

| Método | Endpoint | Descripción | Parámetros / Requisitos |
| --- | --- | --- | --- |
| `GET` | `/dashboard` | Estadísticas del refugio/criador. | Headers: Auth. Solo roles `shelter`, `breeder`. Retorna contadores y próximas citas. |

### 5.6. CATÁLOGOS (`/catalogs`)

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/catalogs/filters` | Retorna razas y ciudades en uso. |
| `GET` | `/catalogs/clinics` | Lista veterinarias activas. (Acepta `?city=`). |

### 5.7. CONTRATOS (`/contracts`)

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/contracts/:appointmentId` | Descarga el PDF del contrato de adopción (generado cuando la cita pasó a `completed`). |

---

## 6. PRÓXIMAS CARACTERÍSTICAS Y ROADMAP

1. **Migración de Storage (Imágenes):** Actualmente las imágenes se procesan con Sharp y se guardan temporalmente en `/public/uploads`. Para un entorno sin estado (*Stateless*), se activará el proveedor `s3.provider.js` guardando los assets en un Bucket de AWS servidos por CloudFront.
2. **Desacoplamiento de Puppeteer:** Mover la generación de PDFs (`pdf.service.js`) a un Worker de AWS SQS/Fargate para evitar cuellos de botella en la RAM del contenedor principal de la API.
3. **Refresh Tokens:** Implementación de persistencia de sesión a largo plazo almacenando familias de hashes en la base de datos (previniendo robo de sesiones).
4. **Autenticación 2FA & Verificación:** Envío de correos de bienvenida y verificación de refugios mediante Nodemailer (Resend/Amazon SES).
5. **OpenAPI / Swagger:** Autogenerar la página interactiva de documentación web a partir de los esquemas creados con Zod.
