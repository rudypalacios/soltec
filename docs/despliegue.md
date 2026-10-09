# Despliegue

Guía para configurar un entorno (`staging` o `production`) y hacer el primer despliegue. El flujo es el de los ADR [0003](adr/0003-migraciones-phinx-por-endpoint.md) y [0004](adr/0004-despliegue-ftps-github-actions.md). Los valores de ejemplo usan el servidor `test.musicos-catolicos.com` (entorno `staging`); para `production` (`soltec.musicos-catolicos.com`) se repite todo cambiando los valores.

## 1. Cómo funciona

El workflow **Deploy** se dispara solo con cada `push`:

| Push a | Despliega en |
|---|---|
| cualquier rama distinta de `main` | `staging` (`test.musicos-catolicos.com`) |
| `main` (el squash merge de un PR) | `production` (`soltec.musicos-catolicos.com`) |

También puede lanzarse a mano (Actions → Deploy → *Run workflow*) y aplica la misma regla a la rama elegida: lanzado desde `main` vuelve a desplegar producción. `staging` es compartido: despliega la última rama que se subió, y las migraciones de una rama sin fusionar quedan aplicadas en la base de `staging`. Por cada despliegue:

1. Corre las pruebas; si fallan, no se despliega. Son las únicas pruebas del CI: sus resultados aparecen también en el PR.
2. Compila la API (`composer install --no-dev`) y la web (`npm run build`).
3. Sube por FTPS **solo las migraciones** y las aplica (`POST /api/system/migrations/apply`).
4. Sube la API, su `index.php` y la web. La subida es **incremental**: el primer despliegue sube todo y los siguientes solo lo que cambió (ver 1.1).
5. Aplica migraciones otra vez (no hace nada salvo en el primer despliegue).
6. Comprueba `GET /api/v1/health` y muestra el **diagnóstico del servidor** en el log.

El FTP no es atómico: durante la subida el sitio puede estar a medias unos segundos. Las migraciones se aplican antes que el código nuevo, así que deben ser compatibles con el código anterior.

### 1.1 Qué se sube y qué se aplica en cada despliegue

- **Archivos:** cada carpeta subida guarda en el servidor un archivo `.ftp-deploy-sync-state.json` con el hash de lo que hay arriba. En el siguiente despliegue solo se suben los archivos nuevos o modificados y se borran los que ya no existen. El primero es el más lento (sube `vendor/` completo).
- **Migraciones:** Phinx lleva en la base de datos la tabla `phinxlog` con las migraciones ya aplicadas y ejecuta únicamente las pendientes. Aplicar dos veces es seguro.

## 2. Lo que configuras tú

### 2.1 En cPanel (una vez por entorno)

1. **Subdominio.** En *Domains* crea el subdominio y pon su *Document Root* en `<carpeta de la instancia>/public`, por ejemplo `test.musicos-catolicos.com/public`. cPanel puede dejar el *Document Root* en la carpeta de la instancia en vez de `public/`: verifícalo en *Domains → Manage* y corrígelo si hace falta (ver la comprobación de la sección 3). Si se queda en la instancia, `.env`, `api/` y `db/` quedan expuestos por URL. La *carpeta de la instancia* (`test.musicos-catolicos.com/`) es la raíz de todo lo del entorno: dentro van `public/` (lo único que el navegador ve), `api/`, `db/` y `storage/`, y a su lado el `.env`. Así el código y las credenciales quedan fuera del alcance de la web.
2. **Qué crea el despliegue.** Tú no creas nada dentro: `public/`, `api/` y `db/migrations/` los sube el workflow (el scaffolding ya los trae). Solo `.env` y `public/.htaccess` los pones tú, porque son propios del servidor.
3. **PHP 8.3.** En *MultiPHP Manager* asigna PHP 8.3 al subdominio. Las extensiones no hace falta revisarlas a mano: el diagnóstico (sección 4) las comprueba en el primer despliegue y avisa si falta alguna.
4. **Base de datos.** En *MySQL Databases* crea una base de datos y un usuario, y agrégalo a la base con **solo estos privilegios**: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `INDEX`, `REFERENCES` y `CREATE TEMPORARY TABLES`. No marques *All Privileges*. Los cuatro primeros son los que usa la aplicación al correr; los demás los necesitan las migraciones (crear y alterar tablas, índices y llaves foráneas) y el diagnóstico (una tabla temporal). Hoy las migraciones corren por el mismo usuario, por eso están todos; separar un usuario de solo lectura/escritura para la aplicación es una mejora pendiente. cPanel antepone tu usuario a los nombres: anota los nombres completos.
5. **Cuenta FTP.** En *FTP Accounts* crea una cuenta cuyo directorio sea la **carpeta de la instancia** (la que contiene `public/`, no `public/` misma). Al conectarse, la cuenta ya cae en esa raíz, así que `FTP_SERVER_DIR` vale `/`. Anota el servidor y el usuario; el protocolo es FTPS.
6. **HTTPS.** Verifica que AutoSSL esté activo en el subdominio y activa *Force HTTPS Redirect*.
7. **Archivo `.env`.** En la carpeta de la instancia (al lado de `public/`, nunca dentro) crea `.env` con permisos `600`:

   ```
   APP_ENV=production
   APP_BASE_PATH=/api
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=<base de datos completa>
   DB_USER=<usuario completo>
   DB_PASS=<contraseña>
   DEPLOY_TOKEN=<ver 2.3>
   JWT_SECRET=<ver 2.5>
   ```

   Si el entorno envía correo, agrega también las variables `MAIL_*` de la sección 2.4.

8. **`.htaccess`.** Copia el contenido de [`deploy/htaccess.sample`](../deploy/htaccess.sample) a `public/.htaccess`. Es de una sola vez: el despliegue nunca lo sube ni lo borra. Si cPanel generó en esa carpeta un bloque `# php -- BEGIN cPanel-generated handler` (al asignar PHP 8.3 en *MultiPHP Manager*), déjalo al final del archivo. Si cambiaste el *Document Root* después de asignar PHP, vuelve a asignar PHP 8.3 para que cPanel lo regenere.

No se usa protección de directorio de cPanel: el acceso lo controla el login de la aplicación y los endpoints de despliegue exigen el token (2.3).

### 2.2 En GitHub (una vez por entorno)

*Settings → Environments → New environment*, con el nombre `staging` (el servidor `test.musicos-catolicos.com`) y luego `production` (el servidor `soltec.musicos-catolicos.com`).

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `FTP_SERVER` | Servidor FTP, por ejemplo `ftp.musicos-catolicos.com` |
| Secret | `FTP_USERNAME` | Usuario de la cuenta FTP |
| Secret | `FTP_PASSWORD` | Contraseña de la cuenta FTP |
| Secret | `FTP_SERVER_DIR` | `/` (si la cuenta FTP apunta a la carpeta de la instancia) |
| Secret | `DEPLOY_TOKEN` | El mismo valor que en el `.env` |
| Variable | `APP_URL` | `https://test.musicos-catolicos.com` (sin barra final) |
| Variable (opcional) | `FTP_PROTOCOL` | `ftps` (es el valor por defecto) |

**Cómo se evita desplegar al entorno equivocado.** Los nombres son los mismos en los dos entornos (`FTP_PASSWORD`, `DEPLOY_TOKEN`...), pero cada *Environment* guarda su propio valor y el workflow toma los del entorno que corresponde a la rama; un prefijo por entorno (`TEST_FTP_PASSWORD`) obligaría a escoger el nombre con lógica en el workflow, que es justo donde se cometería el error. Las reglas que sí protegen:

- **`production` solo acepta `main`.** En *Environments → production → Deployment branches and tags* elige *Selected branches* y agrega `main`. Con eso ninguna otra rama puede desplegar a producción aunque el workflow se equivoque.
- **Todo va en el Environment, nada en *Repository secrets* ni *Repository variables*.** Un secret a nivel de repositorio lo ven todos los entornos; si falta uno en el Environment, el workflow tomaría el del repositorio sin avisar.
- **`production` con *Required reviewers*** (opcional): como producción despliega sola al fusionar, esto agrega una aprobación manual antes de subir. Sin él, el merge a `main` publica directamente.
- El log del smoke test muestra la URL a la que apunta; verifícala antes de aprobar.

### 2.3 El token de despliegue

No lo emite nadie: lo inventas tú. Es una contraseña compartida entre el servidor y GitHub que protege los endpoints de migraciones y diagnóstico (sin ella, o con menos de 32 caracteres, quedan deshabilitados).

- **Formato:** 64 caracteres aleatorios, solo letras y números (los símbolos pueden romper el `.env` o el encabezado HTTP).
- **Cómo generarlo:** sirve cualquier generador con buena aleatoriedad, incluido el de Proton Pass (longitud 64, sin símbolos). Desde el terminal de cPanel también: `php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'`.
- **Dónde va:** el mismo valor en el `.env` del servidor (`DEPLOY_TOKEN`) y en el secret `DEPLOY_TOKEN` del Environment de GitHub.
- **Uno distinto por entorno.** No lo pegues en un chat.

### 2.4 Correo (ADR-0013)

1. En cPanel, *Email Accounts*: crea el buzón remitente (`noreply@musicos-catolicos.com`) con una contraseña larga y aleatoria.
2. En *Email Deliverability*, comprueba que SPF y DKIM del dominio sean válidos y publica un registro DMARC (`p=none` basta al inicio).
3. Agrega al `.env` del entorno (permisos `600`; las credenciales nunca van a la base de datos ni a GitHub):

   ```
   MAIL_DRIVER=smtp
   MAIL_HOST=<servidor SMTP del buzón; su certificado debe coincidir con este nombre>
   MAIL_PORT=465
   MAIL_ENCRYPTION=ssl
   MAIL_USERNAME=noreply@musicos-catolicos.com
   MAIL_PASSWORD=<contraseña del buzón>
   MAIL_FROM_ADDRESS=noreply@musicos-catolicos.com
   MAIL_FROM_NAME=Soltec (staging)
   MAIL_REPLY_TO=<correo de una persona>
   ```

   El remitente debe ser un buzón real del dominio autenticado. `MAIL_DRIVER=mail` es el plan B (sin credenciales, sin confirmación de entrega).
4. **Verificar la entrega.** En GitHub: *Actions → Mail test → Run workflow*, con la dirección de un Gmail o un Outlook que puedas leer. Solo se ejecuta cuando lo lanzas a mano y solo contra `staging`. Si falla, el log muestra el motivo del servidor (por ejemplo `SMTP Error: Could not authenticate`). Repite con la otra dirección.
5. En el mensaje recibido abre *Mostrar original* (Gmail) o *Ver origen del mensaje* (Outlook) y comprueba que SPF, DKIM y DMARC digan `PASS` y que no cayó en spam.

### 2.5 El secreto de las sesiones (`JWT_SECRET`)

Firma los tokens de acceso (el «pase» de 15 minutos con el que el navegador demuestra que inició sesión). Quien lo conozca puede fabricar un pase de administrador, así que no sale del servidor.

- **Formato:** 64 caracteres aleatorios, como el token de despliegue (2.3). Sin él, o con menos de 32 caracteres, el inicio de sesión responde `503 auth_not_configured`.
- **Solo en el `.env`** de cada entorno, **distinto en cada uno**. No va en GitHub ni en el repositorio.
- Cambiarlo cierra todas las sesiones abiertas: la gente vuelve a iniciar sesión, sin más consecuencias.

### 2.6 El primer administrador

Tras el primer despliegue con migraciones, en el terminal de cPanel (carpeta de la instancia):

```
php api/bin/console user:create-admin
```

Pide correo, nombre y contraseña (12 a 72 caracteres, dos veces, sin eco). Se niega si ya existe un administrador activo y no expone ninguna ruta. Ese usuario crea después a los demás desde la aplicación.

## 3. Primer despliegue

1. Verifica que lo de la sección 2 está hecho.
2. Sube cualquier rama que no sea `main` (o lanza *Actions → Deploy → Run workflow* sobre una): despliega a `staging`.
3. En el log, el paso **Apply migrations** (el primero) responde 404 y se tolera; el segundo debe responder `200` con la migración aplicada.
4. El paso **Smoke test** debe terminar en verde y mostrar el diagnóstico.
5. Abre `https://test.musicos-catolicos.com`: debe verse la pantalla vacía con «El servicio está en línea».
6. Comprueba que `https://test.musicos-catolicos.com/.env` **no** devuelve el archivo (404 o 403). Si lo devuelve, el *Document Root* no es `public/`: corrígelo y cambia la contraseña de la base de datos y el `DEPLOY_TOKEN`.

## 4. Qué debe decir el diagnóstico

| Campo | Esperado |
|---|---|
| `php.version` | 8.3.x |
| `extensions` | todas en `true` |
| `images.webp_encode` | `true` (si no, se avisa pero no bloquea) |
| `database.server_version` | 5.7.x |
| `database.generated_column_unique.supported` | `true` (si no, el despliegue falla: el diseño lo necesita) |
| `storage.writable` | `true` tras la primera escritura de logs; si es `false`, crea `storage/` en la carpeta de la instancia |
| `php.memory_limit`, `max_execution_time`, `upload_max_filesize` | Anótalos: condicionan el procesamiento de imágenes y PDFs |

La entrega del correo (buzón de cPanel por SMTP hacia Gmail y Outlook) no sale en el diagnóstico: se verifica con el workflow *Mail test* (sección 2.4).

### 4.1 Lista de requisitos (`/api/system/requirements`)

Es la verificación previa tipo instalador: revisa PHP y sus extensiones, el `.env`, la base de datos (versión, columna generada, y privilegios de esquema probados de verdad con una tabla temporal que se borra en la misma petición), el *Document Root*, `storage/`, las migraciones, HTTPS y el correo (variables `MAIL_*` válidas y login SMTP aceptado, sin enviar nada). Cada punto sale como `pass`, `warn` o `fail`, con una pista de qué hacer, y el veredicto es `ready`, `ready_with_warnings` o `blocked`.

- El workflow Deploy la imprime en el paso *Check server requirements* y marca cada problema como anotación; **no detiene** el despliegue.
- Sin token: ábrela en el navegador en `https://<subdominio>/api/system/requirements`. No está en el contrato ni en buscadores (`X-Robots-Tag` y `robots.txt`).
- Solo responde si la API arranca. Si no hay respuesta, la causa está en el `error_log` de PHP de la instancia.

## 5. Si algo falla

| Síntoma en el log | Causa probable |
|---|---|
| Migraciones: `503 deploy_token_not_configured` | El `.env` no tiene `DEPLOY_TOKEN`, o no está en la carpeta de la instancia |
| Migraciones: `503 deploy_token_too_short` | El token tiene menos de 32 caracteres |
| Migraciones: `401 unauthorized` | El secret `DEPLOY_TOKEN` no coincide con el del `.env` |
| Migraciones: `500 migration_failed` | El mensaje dice la causa; casi siempre credenciales o un privilegio que falta (`CREATE`, `ALTER`, `INDEX`, `REFERENCES`) |
| Migraciones: responde 200 pero no es JSON | Falta el `.htaccess` o el API no llegó a `public/api/` |
| Subida de la API: `Server sent FIN packet unexpectedly` | El hosting cortó una sesión FTP larga. El primer despliegue sube miles de archivos de `vendor/`; relanza con *Re-run failed jobs* (el workflow ya omite la documentación y las pruebas de `vendor/` para acortarlo) |
| Mail test: `503 mail_not_configured` | Falta alguna variable `MAIL_*` en el `.env` (el detalle dice cuál) |
| Mail test: `502 mail_send_failed` | El servidor de correo rechazó el envío; el detalle trae su motivo (credenciales, host o puerto, certificado) |
| Inicio de sesión: `503 auth_not_configured` | Falta `JWT_SECRET` en el `.env` o tiene menos de 32 caracteres (2.5) |
| Smoke: `degraded` | La API responde pero la base de datos no: revisa `DB_*` en el `.env` |
| Smoke: 404 en `/api/v1/health` | Falta `.htaccess` o `mod_rewrite` |
