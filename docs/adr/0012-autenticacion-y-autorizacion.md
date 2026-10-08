# ADR-0012: Autenticación y autorización

**Estado:** Propuesta (falta verificar el terminal de cPanel para el método del primer administrador) · **Fecha:** 2026-10-08

## Contexto
API-first con React (web y PWA, quizá Expo después). Habrá usuarios internos y usuarios externos: los clientes de la empresa tendrán acceso limitado, solo para ver su progreso y su facturación, sin administrar. El hosting no tiene SSH. Se parte de un RBAC ya probado en otro proyecto (una aplicación con sesiones y plantillas Twig): se conservan sus reglas y se cambia el mecanismo.

## Decisión

### Autenticación
- **JWT de acceso corto (~15 min) y refresh token revocable por dispositivo** (tabla `dispositivos`). En web, el refresh va en cookie httpOnly, Secure, del mismo origen (`/api`). En móvil, refresh de larga duración revocable por dispositivo. El endpoint de refresh también acepta el token por cabecera, para poder migrar a Expo.
- El JWT lleva solo usuario, dispositivo y expiración. **Los permisos se leen de la base de datos en cada petición** (una consulta, cacheada por petición): un cambio de perfil o una desactivación se aplica de inmediato.
- Contraseñas con `password_hash` y `PASSWORD_DEFAULT`, con rehash automático. De 12 a 72 bytes y distinta del correo. Expiración configurable (90 días por defecto, según los requerimientos).
- Login: mensaje único para correo inexistente, contraseña incorrecta y cuenta bloqueada; hash señuelo para igualar tiempos; bloqueo tras 3 fallos por 15 minutos con contador atómico (nunca leer-modificar-escribir); un login correcto reinicia el contador; al vencer el bloqueo el contador parte de cero; un solo reloj en UTC con un `Clock` inyectado.
- Recuperar contraseña: token `random_bytes(32)` del que solo se guarda su SHA-256, vigencia de 1 h, un solo uso con un `UPDATE` condicionado. El enlace sale de `APP_URL`, nunca del header `Host`. Respuesta idéntica exista o no la cuenta, un correo por minuto por cuenta, enviado después de responder. Restablecer quita el bloqueo y **revoca todos los refresh tokens**; desactivar un usuario también.
- Cabeceras de seguridad y CSP (el build de React no usa scripts en línea). Logout por POST.

### Autorización
- Tablas: usuarios, perfiles, permisos (los verbos son datos: ver, crear, editar, desactivar y los que hagan falta), recursos (uno por módulo), `perfil_usuario` y `permiso_perfil_recurso` (claves compuestas).
- `PermissionChecker` deniega por defecto. **Cada ruta declara su permiso** (o `autenticada` / `publica`) y un test falla si alguna no declara ninguno.
- **Alcance de datos** por perfil y recurso: propio, equipo (según departamento y jefe directo), todo, o cliente asignado (usuarios externos). Se aplica en un solo punto de la capa de repositorios, no en cada consulta.
- `GET /me` devuelve los permisos efectivos. React oculta menús con una función pura de `shared/`; el control real es el servidor.
- Administración de usuarios y perfiles: el perfil admin es inmutable; solo un admin puede dar o quitar el perfil admin o modificar a otro admin; no se desactiva la propia cuenta ni al último admin; los ids recibidos se filtran contra los existentes; las colisiones de unicidad se convierten en error de campo. Todo cambio queda en la auditoría. Los permisos sobre usuarios y perfiles equivalen casi a ser admin, y se documenta.
- Un módulo nuevo exige su recurso, su grupo de rutas con permiso y una migración que lo cree y se lo conceda al perfil admin.

### Usuarios externos
- Mismo mecanismo, con tipo de usuario externo y un cliente asignado (vinculado a un contacto). Perfiles externos de solo lectura, sin administración. El alcance "cliente asignado" es obligatorio y se prueba con tests de aislamiento. Las cuentas las crea el personal con un enlace de invitación para fijar la contraseña. Las pantallas llegan con el Portal (Hito 9); el modelo se define desde el ERD.

### Parámetros configurables
En la configuración general, con límites mínimo y máximo validados y cambios auditados: inactividad de sesión web, duración del refresh móvil, intentos y minutos de bloqueo, expiración de contraseña y longitud mínima (solo se puede subir por encima de 12). Valores por defecto: 30 min de inactividad en web, unos 30 días de refresh en móvil, 3 intentos, 15 minutos.

### Primer administrador y secretos
- Preferido: un **comando de consola** ejecutado en el terminal de cPanel, que pide correo y contraseña sin eco e inserta el usuario. Si no hay terminal: un endpoint de configuración inicial protegido con el token de despliegue, que solo funciona mientras no exista ningún usuario y se deshabilita después. **Pendiente de verificar el terminal.**
- Ningún secreto en el repo: el `.env` se crea en el servidor, fuera de `public/`, con permisos 600; `JWT_SECRET` distinto por instancia. Las variables nuevas no son obligatorias globalmente, para que un deploy con código nuevo y `.env` viejo no tumbe el sitio.

### Lecciones de implementación (del proyecto anterior)
- En Phinx, `'null' => false` explícito en cada columna que no deba aceptar NULL, siempre en las claves primarias (MySQL da el error 1171).
- MySQL no revierte DDL: las migraciones deben poder recuperarse de su propio resto.
- El `TestCase` base emite un token por perfil.
- PHPStan con filas de DBAL sin tipo: validar antes de usar.
- phpcs PSR-12 con líneas de hasta 120 caracteres.
- Mutaciones deliberadas del código para comprobar que los tests de seguridad (bloqueo, expiración, token de un solo uso, escalada de privilegios, último admin, aislamiento por cliente) las detectan.

## Alternativas descartadas
- Sesiones PHP con cookie: no sirven para móvil ni para una migración a Expo.
- Permisos dentro del JWT: un cambio no se aplica hasta que vence el token.
- Inferir el permiso desde la forma de la URL: frágil; aquí no hay rutas heredadas que preservar.

## Consecuencias
- Una consulta de permisos por petición (indexada y cacheada por petición).
- Límites conocidos: el bloqueo por cuenta permite bloquear a propósito a quien conozca un correo (hay desbloqueo manual y recuperación); no frena intentos contra correos inexistentes (límite por IP en el servidor web); la entrega del correo de recuperación depende del ADR-0013.
