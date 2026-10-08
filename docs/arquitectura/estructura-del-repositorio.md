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

## 4. Convenciones de nombres

- **URLs en español, código en inglés.** Las rutas de la API usan el vocabulario del negocio en español (`/api/v1/clientes`). Todo el código está en inglés: identificadores, comentarios y mensajes de log. Sufijos técnicos habituales: `ClientRepository`, `CreateClientService`, `AuthMiddleware`. *(Confirmado.)*
- **Por confirmar:** la base de datos (tablas y columnas) y los campos JSON también en inglés, porque son código; los textos que ve el usuario viven en la web, en español, y la API devuelve códigos de error en inglés; la documentación, los commits y los PR siguen en español.
- **Glosario:** un archivo `docs/arquitectura/glosario.md` (español → inglés, por ejemplo `paquete` → `bundle`) mantendrá consistentes los nombres entre sesiones. Se crea al confirmar el punto anterior.
- Base de datos: `snake_case`, tablas en plural. Migraciones con nombre en inglés en imperativo (`CreateProfilesTable`).
- API versionada en la ruta: `/api/v1/…`. El contrato fija el versionado; los cambios incompatibles van a una versión nueva (`/api/v2`) que convive con la anterior mientras los clientes migran.
- PHP: PSR-12 con líneas de hasta 120 caracteres; namespace raíz `Soltec\` mapeado a `api/src/` (PSR-4).
- TypeScript: modo estricto, sin `any` implícito.

## 5. Del repositorio al servidor

Cada instancia vive en una carpeta propia del hosting. El subdominio apunta a `public/`; todo lo demás queda fuera del alcance de internet. La web se sirve en `/` y la API en `/api/v1`, bajo el mismo origen (sin CORS, refresh token en cookie; ver ADR-0004 y ADR-0012).

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

- `index.php` carga `../../api/vendor/autoload.php` y lee `../../.env`; Slim se configura con `/api` como ruta base y agrupa las rutas bajo `/v1`; una versión nueva convive con la anterior, para poder cambiar la API poco a poco.
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

## 8. Estado de las decisiones

**Confirmadas**
1. Un solo origen: web en `/`, API en `/api/v1` (versionada para migrar poco a poco).
2. Organización por módulo, con módulos autocontenidos y capas dentro.
3. URLs en español; código, comentarios e identificadores en inglés.

**Pendientes**
1. `npm workspaces` para que `web/` use `shared/` sin publicarlo (explicado; falta confirmar).
2. Código generado desde el contrato sin versionar (explicado; falta confirmar).
3. Detalles del idioma: base de datos y campos JSON en inglés, textos de usuario en la web, documentación y commits en español (sección 4).
4. Si "atómico" incluye Atomic Design para los componentes de la web.
5. El servidor calcula los precios y `shared/` solo los previsualiza, con los mismos vectores de prueba en `contract/test-vectors/`: ver [ADR-0014](../adr/0014-el-servidor-calcula-los-precios.md).
