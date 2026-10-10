# Esqueleto de autenticación y roles

**Entregable 5 del Hito 0** · Estado: borrador para revisión · Fecha: 2026-10-09

Convierte el [ADR-0012](../adr/0012-autenticacion-y-autorizacion.md) en un diseño que se pueda programar en el Hito 1: piezas, flujos, endpoints y pruebas. No repite lo que el ADR ya decide (contraseñas, bloqueo, recuperación, administración de usuarios, usuarios externos); lo concreta. Las tablas están en el [ERD del Hito 1](erd/01-fundaciones.md) (con los nombres del [glosario](glosario.md): `roles`, `role_permissions`, `role_scopes`, `devices`, …).

## 1. Piezas

| Pieza | Dónde | Responsabilidad |
|---|---|---|
| `Clock` | `Kernel` | Un solo reloj en UTC, inyectado (también en las pruebas) |
| `JwtService` | `Kernel/Auth` | Emite y valida el token de acceso |
| `AuthenticationMiddleware` | `Kernel/Auth` | Lee `Authorization: Bearer`, valida y deja un `CurrentUser` en la petición |
| `PermissionMiddleware` | `Kernel/Auth` | Lee el permiso que declara la ruta y consulta al `PermissionChecker` |
| `CurrentUser::can` | `Kernel/Auth` | `can(recurso, acción): bool`. Niega por defecto. Reemplaza al `PermissionChecker` previsto: el usuario ya trae sus permisos cargados, y una clase aparte solo los reenviaría |
| `DataScope` | `Kernel/Auth` | Alcance efectivo del usuario sobre un recurso: `own`, `team`, `all`, `client` |
| `ScopedQuery` | `Kernel/Db` | Aplica el alcance a una consulta; único punto donde se filtra por alcance |
| Módulo `Access` | `Modules/Access` | Casos de uso: login, refresh, logout, recuperar y cambiar contraseña, invitaciones, usuarios, roles, dispositivos. Incluye `AdminGuard` (regla del último administrador, 7.1) y `AuditLogger` |

`Kernel` no conoce al módulo `Access`: el módulo implementa las interfaces que el `Kernel` define (`UserRepository`, `PermissionRepository`).

## 2. Cadena de middleware

`SecurityHeaders → ErrorHandler → Routing → Authentication → Permission → controlador`

- Cada ruta **declara su permiso** como argumento de la ruta: `users.view`, o `authenticated` (cualquier usuario con sesión), o `public`. Una ruta sin declaración falla un test (ADR-0012).
- `Authentication` salta las rutas `public`. `Permission` salta `public` y `authenticated`.
- Las rutas de `/system` (despliegue) quedan fuera: las protege el token de despliegue.

## 3. Token de acceso (JWT)

- HS256 con `JWT_SECRET` del `.env` (mínimo 32 caracteres, distinto por instancia). Sin el secreto, el login responde 503, como los endpoints de despliegue.
- Vigencia de 15 minutos. Claims: `sub` (id del usuario), `did` (id del dispositivo), `iat`, `exp`, y `scp` solo en el token restringido (ver 6).
- **Sin permisos dentro del token**: se leen de la base de datos en cada petición, con una consulta por petición (usuario → roles → permisos y alcances), guardada en el `CurrentUser`. El middleware también comprueba que el usuario siga activo y que el dispositivo no esté revocado.
- Web: el token vive solo en memoria de la página; el refresco lo recupera al recargar. Móvil: almacenamiento seguro, detrás de un puerto de `shared/` (ADR-0012).

## 4. Refresh token

- Opaco, 32 bytes aleatorios; en `refresh_tokens` solo se guarda su SHA-256.
- **Rotación**: cada refresco emite uno nuevo y revoca el anterior. Si llega uno ya revocado, se revocan todos los de ese dispositivo (señal de robo).
- Web: cookie `httpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`. El mismo origen evita CORS, y `SameSite=Strict` junto a un cuerpo JSON cubre el CSRF. Móvil: el token viaja en el cuerpo y en un puerto de almacenamiento seguro.
- Dos pestañas pueden refrescar a la vez: una ventana de gracia de **10 segundos** tras la rotación evita que la segunda se tome por robo. Solo vale para el token que llega por cookie (la web, donde el navegador comparte la cookie ya renovada); un token enviado en el cuerpo (móvil) que se reusa se trata siempre como robo. La web se mantiene abierta mientras haya actividad: cada refresco extiende 30 minutos de inactividad; el móvil dura 30 días. *Constantes en `SecurityPolicy` hasta la rebanada 1.3, que las lee de `security_settings`.*

## 5. Endpoints (insumo del contrato OpenAPI)

Todos bajo `/api/v1`. Errores en `application/problem+json` con un `code` estable en inglés.

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `POST /auth/login` | pública | Correo, contraseña y datos del dispositivo → token de acceso, usuario y permisos efectivos; fija la cookie de refresco |
| `POST /auth/refresh` | pública (la cookie o el cuerpo) | Rota el refresh y emite un token de acceso nuevo |
| `POST /auth/logout` | autenticada, incluso con token restringido | Revoca el dispositivo actual |
| `POST /auth/password/forgot` | pública | Siempre responde igual; envía el correo si la cuenta existe |
| `POST /auth/password/reset` | pública (token de un solo uso) | Fija la contraseña, quita el bloqueo y revoca todos los refresh |
| `POST /auth/password/change` | autenticada, incluso con token restringido | Cambia la contraseña conociendo la actual y cierra la sesión de los demás dispositivos |
| `POST /auth/invitations/accept` | pública (token de un solo uso) | Un usuario externo fija su contraseña |
| `GET /me` | autenticada | Usuario, roles, permisos efectivos y alcances |
| `GET /me/devices`, `DELETE /me/devices/{id}` | autenticada | Ver y cerrar sesión en un dispositivo propio |
| `POST /users/{id}/unlock` | `users.edit` | Quita el bloqueo por intentos fallidos |
| `GET/POST /users`, `GET/PATCH /users/{id}` | `users.view/create/edit` | Administración de usuarios |
| `POST /users/{id}/deactivate`, `/reactivate`, `/invite` | `users.deactivate`, `users.edit` | Desactivar (revoca sesiones), reactivar, reenviar invitación |
| `GET/POST /roles`, `GET/PATCH /roles/{id}` | `roles.*` | Roles con su matriz de permisos y alcances |
| `GET /resources`, `GET /permissions` | `roles.view` | Catálogos de solo lectura para armar la matriz |

El contrato de las rutas ya construidas está en [`contract/openapi.yaml`](../../contract/openapi.yaml) (se amplía por rebanadas, ver `TODO.md`); cada operación declara su permiso en `x-permission`. El resto de módulos agrega sus rutas con su recurso. La contraseña y los tokens nunca salen en respuestas ni en la auditoría.

## 6. Contraseña vencida o inicial

Si la contraseña venció o `must_change_password` es verdadero (cuenta creada o importada), el login **tiene éxito** pero emite un **token restringido** (claim `scp: password_change`) que solo sirve para `POST /auth/password/change`. Cualquier otra ruta responde 403 `password_change_required`. Así el usuario nunca queda fuera ni tiene acceso a nada antes de cambiarla.

## 7. Permisos y alcance

- **Permiso**: par (recurso, acción) en `role_permissions`. Acciones: `view`, `create`, `edit`, `deactivate` y las que haga falta (`approve`…), como datos. Un usuario con varios roles tiene la unión de sus permisos.
- **Alcance** por (rol, recurso) en `role_scopes`; sin fila, `own`. *Desde la rebanada 1.2 se aceptan `own`, `team` y `all`; `client` llega con el portal. Un alcance guardado que aún no se implementa no abre datos: no coincide con nada.* Con varios roles gana el más amplio: `all` > `team` > `own`. `client` solo existe para roles externos y es el único alcance que pueden tener.
- **Aplicación**: cada repositorio declara la columna que indica a quién pertenece cada fila (`clients.seller_id`, `tasks.assignee_id`, `tickets.client_id`…). `ScopedQuery` agrega el filtro: `own` → esa columna = usuario; `team` → pertenece a alguien del equipo; `all` → sin filtro; `client` → la columna de cliente = `users.client_id`. Nadie escribe ese filtro a mano.
- **Equipo**: el usuario, sus subordinados directos e indirectos (`manager_id`) y los miembros de su departamento. Solo existe para usuarios internos: un usuario externo no tiene departamento ni jefe. `PermissionLoader` lo calcula una vez por petición, y solo si algún alcance es `team`: lee la jerarquía de los usuarios internos (activos o no, para que un jefe desactivado no corte la cadena) y la recorre en PHP con `Team::members` (MySQL 5.7 no tiene CTE recursivo). `ScopedQuery` filtra con `IN (…)`.
- Para operaciones sobre un registro puntual, el alcance también se comprueba: un id fuera del alcance responde 404, no 403, para no revelar que existe.
- **Nadie deja un registro fuera de su propio alcance** al crearlo o moverlo, porque lo perdería en ese momento. En usuarios: con `team`, el usuario debe quedar en el departamento de quien llama o bajo alguien de su equipo (`422 out_of_scope`); con `own` no se crea a nadie (403). El propio registro está exento.

## 7.1 Protección contra quedarse fuera

- **Nadie se desactiva a sí mismo**, sea administrador o no.
- **El único administrador activo no puede quitarse a sí mismo el rol `admin`** ni cambiar sus propios roles. El rol `admin` es inmutable (todos los permisos y alcance `all`), así que tampoco hay forma de recortárselo desde el rol.
- Con otro administrador activo, un administrador sí puede dejar de serlo; el sistema nunca queda sin uno.
- Quitar o desactivar al último administrador se rechaza con `409 last_admin`. El administrador que necesite dejar el cargo primero asigna a otro.
- Todos estos intentos quedan en la auditoría.

## 8. Usuarios externos

Mismo mecanismo con `users.type = 'external'`: perfiles externos de solo lectura, alcance `client` obligatorio, `client_id` obligatorio. La cuenta la crea el personal y llega una **invitación** (`account_tokens`, propósito `invitation`, enlace desde `APP_URL`). Las pantallas son del Hito 9; en el Hito 1 queda el modelo, el flujo de invitación y las pruebas de aislamiento.

## 9. Datos iniciales y primer administrador

- Una migración siembra `resources`, `permissions` y los roles de sistema: **`admin`** (inmutable, todos los permisos y alcance `all`) y, con el portal (Hito 9), **`external_client`** (solo lectura, alcance `client`). Los demás roles (P5) los crea el administrador desde la interfaz. *Rebanada 1.1: se siembra `admin` y solo los recursos `users` y `roles`; cada rebanada o módulo agrega su recurso con su migración y se lo concede a `admin`.*
- Recursos del Hito 1: `users`, `roles`, `departments`, `company`, `financial_settings`, `security_settings`, `mail_settings`, `margin_levels`, `sequences`, `audit_logs`, `dashboard`. Cada módulo posterior agrega los suyos en su migración.
- **Primer administrador**: dos entradas con el mismo servicio (`AdminBootstrap`), que cumple la política de contraseña y **se niega si ya existe un administrador**. (1) `php api/bin/console user:create-admin` en el terminal; pide correo y contraseña sin eco. (2) Un paso tras las migraciones del despliegue (`PostMigrationStep`) que lee `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `ADMIN_NAME` del `.env`: corre con el PHP del servidor web, sirve cuando el terminal del hosting tiene otra versión de PHP y es seguro en cada despliegue (no hace nada si ya hay administrador). No es una migración porque Phinx la corre una sola vez: si las variables llegaran después, nunca se crearía. No expone ninguna ruta; el `/system/requirements` avisa mientras `ADMIN_PASSWORD` siga en el `.env`.

## 10. Errores

Códigos estables en inglés: `invalid_credentials` (mismo para correo inexistente, contraseña errónea y cuenta bloqueada), `password_change_required`, `token_expired`, `token_invalid`, `forbidden`, `not_found`, `validation_failed`, `conflict` (versión desfasada, o regla que bloquea el cambio, como un perfil en uso), `last_admin`, `system_role_immutable` (perfil de sistema), `default_margin_level` (nivel de margen por defecto), `auth_not_configured` (falta `JWT_SECRET`). La lista cerrada vive en `ErrorCode` del contrato. Un intento de desactivarse a sí mismo o de dar el perfil `admin` sin ser admin responde `forbidden`.

## 11. Pruebas obligatorias

Unitarias y de integración, y mutaciones deliberadas del código para comprobar que detectan el fallo (ADR-0012):

- Bloqueo por intentos, contador atómico y reinicio al vencer; mensaje único en el login y tiempos parejos.
- Expiración de contraseña y token restringido; token de recuperación de un solo uso con peticiones simultáneas; revocación de todos los refresh al restablecer o desactivar.
- Rotación del refresh y detección de reutilización.
- Toda ruta declara permiso; un permiso ausente niega; un cambio de rol se aplica en la siguiente petición.
- Escalada de privilegios: solo un admin da o quita `admin`; los ids recibidos se filtran contra los existentes.
- Protección contra quedarse fuera (7.1): nadie se desactiva a sí mismo; el único admin no puede quitarse el rol ni cambiar sus propios roles; el último admin no se desactiva ni se degrada.
- Aislamiento por cliente: un usuario externo nunca ve ni toca datos de otro cliente, en cada recurso con `client_id`.
- Alcance: `own`, `team`, `all` y `client` por recurso, y un id fuera del alcance responde 404.

## 12. Orden de construcción en el Hito 1

1. `Clock`, `JwtService` y las migraciones del [ERD](erd/01-fundaciones.md).
2. Login, refresh, logout y `GET /me`.
3. `PermissionMiddleware`, `PermissionChecker` y la regla «toda ruta declara permiso».
4. `DataScope` y `ScopedQuery`.
5. Administración de usuarios y roles, con sus reglas.
6. Recuperar contraseña, cambio de contraseña e invitaciones.
7. Comando del primer administrador.

Cada paso con sus pruebas y su parte del contrato OpenAPI. La rebanada 1.1 (acceso) cubre los pasos 1 a 5 en lo que usa (alcance `own`/`all`) y el comando del paso 7; recuperar contraseña e invitaciones (paso 6) llegan con la rebanada 1.1b ([ADR-0017](../adr/0017-credenciales-por-enlace-de-correo.md)); `team` y `client`, con las siguientes.

## 13. Por confirmar

| Tema | Supuesto |
|---|---|
| Definición de **equipo** | Confirmada en la rebanada 1.2: el usuario, sus subordinados por jefe directo y su departamento |
| **Roles de negocio** (P5) | Los crea el administrador; solo se siembran `admin` y `external_client` |
| **Ventana de gracia** del refresh entre pestañas | 10 segundos (confirmada en la rebanada 1.1) |
| **Límite por IP** en el login | Solo bloqueo por cuenta en esta etapa; el límite por IP se evalúa si hace falta |
| Biblioteca JWT | `firebase/php-jwt` 7.x (confirmada en la rebanada 1.1; la 6.x tiene un aviso de seguridad de claves cortas) |
