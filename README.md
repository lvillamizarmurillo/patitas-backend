```markdown
# Patitas Backend - Sistema de Adopciones 🐾

Backend monolítico y dockerizado para la plataforma de adopción de mascotas "Patitas". Construido con Node.js, Express y PostgreSQL (Sequelize ORM). Diseñado para gestionar usuarios (adoptantes, refugios, criadores), publicaciones de mascotas, filtros avanzados de búsqueda y un sistema de agendamiento de citas en clínicas veterinarias aliadas.

---

## 📑 Índice

1. [Requisitos Previos](#requisitos-previos)
2. [Instalación y Configuración](#instalación-y-configuración)
3. [Esquema de Base de Datos y Seeders](#esquema-de-base-de-datos-y-seeders)
4. [Endpoints de la API](#endpoints-de-la-api)
5. [Próximas Características](#próximas-características)

---

## 🛠️ Requisitos Previos

*   **Node.js** (v20 o superior)
*   **Docker** y **Docker Compose**
*   **PostgreSQL** (Si se desea ejecutar fuera de Docker)
*   Cliente Git

---

## 🚀 Instalación y Configuración

**1. Clonar el repositorio:**
```bash
git clone [https://github.com/lvillamizarmurillo/patitas-backend.git](https://github.com/lvillamizarmurillo/patitas-backend.git)
cd patitas-backend

```

**2. Configurar variables de entorno:**
Crea un archivo llamado `.env` en la raíz del proyecto y agrega la siguiente configuración:

```env
PORT=3000
DB_HOST=db
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=123456
DB_NAME=postgres
JWT_SECRET=tu_secreto_super_seguro_patitas_2026
JWT_EXPIRES_IN=24h
NODE_ENV=development

```

*(Nota: Si ejecutas la base de datos localmente sin Docker, cambia `DB_HOST` a `localhost`).*

**3. Levantar la infraestructura (Docker):**

```bash
docker compose up --build

```

La API estará disponible en `http://localhost:3000`.

---

## 🗄️ Esquema de Base de Datos y Seeders

El proyecto utiliza Sequelize para la sincronización automática de modelos (`sequelize.sync({ alter: true })`). Sin embargo, para crear la estructura manualmente y poblar la base de datos con datos de prueba, ejecuta el siguiente script SQL en tu cliente (ej. DBeaver, pgAdmin):

```sql
-- Habilitar UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tipos ENUM
CREATE TYPE enum_users_role AS ENUM ('adopter', 'shelter', 'breeder', 'individual');
CREATE TYPE enum_pets_adoption_type AS ENUM ('adoption', 'sale');
CREATE TYPE enum_pets_status AS ENUM ('available', 'in_process', 'adopted');
CREATE TYPE enum_appointments_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');

-- Tablas
CREATE TABLE "Users" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "role" enum_users_role NOT NULL DEFAULT 'adopter',
    "fullName" VARCHAR(255) NOT NULL,
    "city" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "phone" VARCHAR(50) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Pets" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "breed" VARCHAR(255) NOT NULL,
    "ageMonths" INTEGER NOT NULL,
    "city" VARCHAR(255) NOT NULL,
    "price" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    "adoptionType" enum_pets_adoption_type NOT NULL DEFAULT 'adoption',
    "status" enum_pets_status NOT NULL DEFAULT 'available',
    "imageUrl" VARCHAR(255),
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("ownerId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "VetClinics" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "city" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Appointments" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "meetingDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "status" enum_appointments_status DEFAULT 'pending',
    "notes" TEXT,
    "adopterId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("adopterId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("petId") REFERENCES "Pets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("clinicId") REFERENCES "VetClinics"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- SEEDERS (Datos de Prueba)
INSERT INTO "Users" ("id", "role", "fullName", "city", "email", "phone", "password", "termsAccepted") VALUES 
('d9b2d63d-a233-4123-8472-000000000001', 'shelter', 'Refugio Patitas Unidas', 'Bogotá', 'hola@refugiopatasunidas.org', '+573000000001', 'hash_simulado_123', true),
('d9b2d63d-a233-4123-8472-000000000002', 'adopter', 'Ana María Ríos', 'Medellín', 'ana@correo.com', '+573000000000', 'hash_simulado_456', true);

INSERT INTO "Pets" ("id", "name", "breed", "ageMonths", "city", "price", "adoptionType", "status", "imageUrl", "ownerId") VALUES 
('e8c3e74e-b344-5234-9583-111111111111', 'Nube', 'Bulldog francés', 4, 'Medellín', 3900000.00, 'sale', 'available', '[https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80](https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80)', 'd9b2d63d-a233-4123-8472-000000000001'),
('e8c3e74e-b344-5234-9583-222222222222', 'Tito', 'Schnauzer', 24, 'Bogotá', 0.00, 'adoption', 'available', '[https://images.unsplash.com/photo-1583337130417-3346a1be7dee?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80](https://images.unsplash.com/photo-1583337130417-3346a1be7dee?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80)', 'd9b2d63d-a233-4123-8472-000000000001');

INSERT INTO "VetClinics" ("id", "name", "address", "city", "phone", "isActive") VALUES 
('f7d4f85f-c455-6345-0694-333333333333', 'Maxcotas Center', 'Calle 10 # 43-20', 'Medellín', '321 453 0334', true),
('f7d4f85f-c455-6345-0694-444444444444', 'Vet Salud Animal', 'Carrera 15 # 85-40', 'Bogotá', '310 987 6543', true);

```

---

## 📡 Endpoints de la API

Base URL: `http://localhost:3000/api`

### 1. Sistema (`/health`)

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/health` | Verifica el estado del servidor. Retorna `200 OK`. |

### 2. Autenticación y Usuarios (`/auth`)

| Método | Endpoint | Descripción | Requisitos |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Registra un nuevo usuario en la plataforma. | **Body JSON:** `role` (adopter, shelter, breeder, individual), `fullName`, `city`, `email`, `phone`, `password`, `termsAccepted` (boolean). |
| `POST` | `/auth/login` | Inicia sesión y devuelve un token JWT. | **Body JSON:** `email`, `password`. |
| `GET` | `/auth/me` | Verifica el perfil del usuario autenticado. | **Headers:** `Authorization: Bearer <token>` |

### 3. Mascotas (`/pets`)

| Método | Endpoint | Descripción | Requisitos |
| --- | --- | --- | --- |
| `GET` | `/pets` | Lista todas las mascotas. Permite filtros dinámicos. | **Query Params (opcionales):** `?city=Bogota&breed=Beagle&filter=adopcion` (Filtros soportados: adopcion, criador, cachorros). |
| `GET` | `/pets/:id` | Muestra el detalle de una mascota por su UUID. | Parámetro de ruta `:id`. |
| `POST` | `/pets` | Publica una nueva mascota con imagen. | **Headers:** `Authorization: Bearer <token>`. <br>

<br>**Form-Data:** `name`, `breed`, `ageMonths`, `city`, `price`, `adoptionType`, `image` (Archivo binario local). |

### 4. Catálogos y Filtros (`/catalogs`)

| Método | Endpoint | Descripción | Requisitos |
| --- | --- | --- | --- |
| `GET` | `/catalogs/filters` | Obtiene listas de razas y ciudades únicas registradas. | Útil para llenar los menús desplegables del frontend. |
| `GET` | `/catalogs/clinics` | Lista las clínicas veterinarias activas. | **Query Params (opcionales):** `?city=Medellin` para filtrar por ciudad. |

### 5. Agendamiento de Citas (`/appointments`)

| Método | Endpoint | Descripción | Requisitos |
| --- | --- | --- | --- |
| `POST` | `/appointments` | Agendar un encuentro en una veterinaria. | **Headers:** `Authorization: Bearer <token>` <br>

<br>**Body JSON:** `petId`, `clinicId`, `meetingDate` (ISO 8601), `notes`. |
| `GET` | `/appointments` | Lista las citas del usuario. | **Headers:** `Authorization: Bearer <token>`. Retorna las citas del adoptante, o las citas agendadas hacia las mascotas de un refugio/criador. |
| `PUT` | `/appointments/:id/status` | Actualiza el estado de una cita. | **Headers:** `Authorization: Bearer <token>` <br>

<br>**Body JSON:** `status` ('confirmed', 'cancelled', 'completed'). Si se cancela, la mascota vuelve a estado `available`. |

---

## 🔮 Próximas Características

* **Integración de Almacenamiento en la Nube:** Próximamente se reemplazará el gestor de subida de imágenes local (`multer` en la carpeta `public/uploads`) por una integración nativa y optimizada con **Google Drive API** o **Cloudinary** para centralizar la entrega de *assets* estáticos y aliviar la carga en el servidor.
* **Geolocalización con PostGIS:** Expansión del esquema actual de ciudades para incluir radios de proximidad exactos entre adoptantes y clínicas veterinarias mediante coordenadas.

```

```