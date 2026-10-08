# Estructura del repositorio

**Entregable 2 del Hito 0** · Estado: borrador para revisión · Fecha: 2026-10-08

Este documento fija dónde vive cada cosa en el repositorio y dónde termina cada cosa en el servidor. No contiene código. Se materializa en el scaffolding (0B).

## 1. Principios

- **Monorepo.** Un solo repositorio con la API, el código compartido y la web. Cada instancia (empresa) despliega el mismo código y cambia solo su `.env` y su base de datos.
- **`shared/` no conoce la plataforma.** Nada de `window`, `document` ni `localStorage`; se hace cumplir con una regla de ESLint y sin la librería DOM en su `tsconfig`.
- **La API no renderiza vistas.** La única excepción son las plantillas HTML de los PDF (ADR-0007).
- **Sin carpetas para hitos futuros.** `mobile/` se crea en el Hito 8; la sincronización offline, en el mismo hito.
- **El código se organiza por módulo,** con capas dentro. Los módulos son los del [mapa de módulos](mapa-de-modulos.md).

## 2. Árbol del repositorio

```
soltec/
├── CLAUDE.md · TODO.md · README.md
├── package.json              npm workspaces: shared, web
├── .github/
│   ├── workflows/            tests.yml (reutilizable) · deploy.yml (test y producción)
│   └── scripts/              migrate.sh
├── contract/                 contrato de la API (fuente única, ADR-0006)
│   ├── openapi.yaml · paths/ · schemas/
│   └── test-vectors/         casos de prueba compartidos entre PHP y TypeScript
├── api/                      backend PHP 8.3 + Slim 4
│   ├── composer.json · phpcs.xml · phpstan.neon.dist · phpunit.xml · .env.example
│   ├── public/               index.php (front controller)
│   ├── config/               contenedor de dependencias, rutas por módulo, ajustes sin secretos
│   ├── src/
│   │   ├── Kernel/           transversal: Http (middleware, errores), Auth, Db, Clock, Mail, Files, Pdf, Audit
│   │   └── Modules/<Modulo>/ Http · Application · Domain · Infrastructure
│   ├── templates/pdf/        plantillas HTML para Dompdf
│   ├── bin/                  comandos de consola (p. ej. crear el primer administrador)
│   └── tests/                Unit · Integration
├── db/
│   ├── migrations/           Phinx (ADR-0003)
│   ├── seeds/
│   └── phinx.php
├── shared/                   TypeScript sin dependencia de la plataforma
│   └── src/                  api (cliente generado) · domain · ports
├── web/                      React + TypeScript + MUI (Vite)
│   └── src/                  app · modules/<modulo> · adapters · theme
├── deploy/                   htaccess.sample
└── docs/                     requerimientos · adr/ · arquitectura/
```

## 3. Qué hace cada carpeta

| Carpeta | Contiene | No debe contener |
|---|---|---|
| `contract/` | El contrato OpenAPI y los vectores de prueba compartidos | Código |
| `api/src/Kernel/` | Lo que usan todos los módulos: middleware, autenticación, conexión a la base de datos, reloj, correo, archivos, PDF, auditoría | Reglas de un módulo concreto |
| `api/src/Modules/<Modulo>/Http` | Controladores y la declaración de permisos de cada ruta | Lógica de negocio |
| `…/Application` | Servicios que ejecutan los casos de uso y coordinan transacciones | Consultas SQL |
| `…/Domain` | Reglas puras, valores, interfaces de repositorio | Dependencias de infraestructura |
| `…/Infrastructure` | Repositorios con Doctrine DBAL y adaptadores | Reglas de negocio |
| `db/` | Migraciones y datos iniciales | Datos de una empresa concreta |
| `shared/src/api` | Cliente tipado y esquemas Zod **generados** desde `contract/` | Cambios a mano |
| `shared/src/domain` | Reglas puras (permisos, vista previa de precios) | Acceso al navegador |
| `shared/src/ports` | Interfaces de lo que toca el dispositivo (almacenamiento, geolocalización, cámara, push, tokens) | Implementaciones |
| `web/src/adapters` | Implementaciones web de esos puertos | Lógica de negocio |
| `web/src/modules/<modulo>` | Pantallas, componentes y hooks de datos de ese módulo | Reglas de negocio |

La regla de dependencias es: `Http → Application → Domain ← Infrastructure`. Un módulo no importa las clases internas de otro: se comunican por la capa `Application` o por eventos del `Kernel`.

## 4. Convenciones de nombres (propuesta, por confirmar)

- **Vocabulario de dominio en español** (tablas, columnas, rutas, clases de dominio) porque es el lenguaje del negocio: `clientes`, `/clientes`, `Cliente`. **Sufijos técnicos en inglés**: `ClienteRepository`, `CrearClienteService`, `AuthMiddleware`.
- Base de datos: `snake_case`, tablas en plural. Migraciones: nombre en español en imperativo (`CrearTablaPerfiles`).
- API: `/api/v1/…`; el contrato fija el versionado y los cambios incompatibles van a una versión nueva.
- PHP: PSR-12 con líneas de hasta 120 caracteres; namespace raíz `Soltec\` mapeado a `api/src/` (PSR-4).
- TypeScript: modo estricto, sin `any` implícito.

## 5. Del repositorio al servidor

Cada instancia vive en una carpeta propia del hosting. El subdominio apunta a `public/`; todo lo demás queda fuera del alcance de internet. La web se sirve en `/` y la API en `/api`, bajo el mismo origen (sin CORS, refresh token en cookie; ver ADR-0004 y ADR-0012).

```
<raíz de la instancia>/
├── public/                   raíz del subdominio
│   ├── index.html · assets/  build de web/
│   ├── api/index.php         front controller de la API
│   └── .htaccess             solo en el servidor
├── api/                      src · config · templates · bin · vendor · composer.*
├── db/migrations/
├── storage/                  logs y archivos subidos (solo en el servidor)
└── .env                      solo en el servidor, permisos 600
```

| En el repositorio | En el servidor | Cuándo se sube |
|---|---|---|
| `db/migrations/` | `db/migrations/` | Primero; se aplican antes de subir la app (ADR-0003) |
| `api/src`, `config`, `templates`, `bin`, `vendor`, `composer.json` | `api/` | Con la aplicación |
| `api/public/index.php` | `public/api/index.php` | Con la aplicación |
| `web/dist/` (build) | `public/` | Con la aplicación |
| `deploy/htaccess.sample` | `public/.htaccess` | No se sube; lo copia una persona la primera vez |
| — | `.env`, `storage/` | Nunca se suben ni se sobrescriben |

- `index.php` carga `../../api/vendor/autoload.php` y lee `../../.env`; Slim se configura con `/api` como ruta base.
- El `.htaccess` reenvía `/api/*` a `public/api/index.php` y cualquier otra ruta que no sea un archivo a `index.html` (para el enrutado de React).
- El despliegue excluye `.env`, `.htaccess`, `storage/`, pruebas y archivos de desarrollo. `api/bin/` **sí** se sube: contiene el comando del primer administrador.
- El scaffolding verifica que cada paso de subida no borre lo que subió el otro.

## 6. Herramientas de calidad

| Paquete | Herramientas |
|---|---|
| `api` | phpcs (PSR-12), phpstan en nivel estricto desde el inicio, phpunit (unitarias e integración contra MySQL 5.7) |
| `shared`, `web` | ESLint, Prettier, `tsc --noEmit` en modo estricto, Vitest |
| `contract` | Lint del OpenAPI y un test que falla si una ruta de la API no está en el contrato o no declara su permiso |

El CI ejecuta un trabajo por paquete y el despliegue depende de que todos pasen. El código generado desde `contract/` no se versiona: se genera en el CI y con un comando local, y el CI verifica que el contrato y el código coincidan.

## 7. Qué no se crea todavía

`mobile/`, la sincronización offline y el endpoint `GET /sync` (Hito 8), el portal de cliente (Hito 9) y cualquier carpeta de módulo de un hito posterior. Cada módulo aparece cuando llega su hito.

## 8. Decisiones que necesitan confirmación

1. **Un solo origen** (`/` y `/api`), pendiente en el ADR-0004.
2. **`npm workspaces`** para que `web/` use `shared/` sin publicarlo como paquete.
3. **Organización por módulo con capas dentro**, en vez de capas globales con los módulos dentro.
4. **Idioma de nombres** (sección 4).
5. **Código generado sin versionar** (sección 6).
6. **El servidor calcula los precios y `shared/` solo los previsualiza,** con los mismos vectores de prueba en `contract/test-vectors/`. Precisa el ADR-0011: ver [ADR-0014](../adr/0014-el-servidor-calcula-los-precios.md).
