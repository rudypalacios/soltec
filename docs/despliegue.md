# Despliegue

Guía para configurar un entorno (`test` o `soltec`) y hacer el primer despliegue. El flujo es el de los ADR [0003](adr/0003-migraciones-phinx-por-endpoint.md) y [0004](adr/0004-despliegue-ftps-github-actions.md). Los valores de ejemplo usan `test.musicos-catolicos.com`; para `soltec` se repite todo cambiando el nombre.

## 1. Cómo funciona

El workflow **Deploy** (GitHub → Actions → Deploy → *Run workflow*) se lanza a mano, eligiendo la rama y el entorno:

1. Corre las mismas pruebas del CI; si fallan, no se despliega.
2. Compila la API (`composer install --no-dev`) y la web (`npm run build`).
3. Sube por FTPS **solo las migraciones** y las aplica (`POST /api/system/migrations/apply`).
4. Sube la API, su `index.php` y la web.
5. Aplica migraciones otra vez (no hace nada salvo en el primer despliegue).
6. Comprueba `GET /api/v1/health` y muestra el **diagnóstico del servidor** en el log.

El FTP no es atómico: durante la subida el sitio puede estar a medias unos segundos. Las migraciones se aplican antes que el código nuevo, así que deben ser compatibles con el código anterior.

## 2. Lo que configuras tú

### 2.1 En cPanel (una vez por entorno)

1. **Carpeta de la instancia.** Crea una carpeta para el entorno, por ejemplo `test.musicos-catolicos.com/`, con una subcarpeta `public/`.
2. **Subdominio.** Crea el subdominio y apunta su *Document Root* a `<carpeta de la instancia>/public`.
3. **PHP 8.3.** En *MultiPHP Manager* asigna PHP 8.3 al subdominio. En *Select PHP Version* (o *MultiPHP INI Editor*) verifica que estén `pdo_mysql`, `mbstring`, `intl`, `gd`, `fileinfo`, `openssl` y `curl`.
4. **Base de datos.** En *MySQL Databases* crea una base de datos y un usuario, y agrégalo a la base con **todos los privilegios** (la prueba de diagnóstico usa una tabla temporal). cPanel antepone tu usuario a los nombres: anota los nombres completos.
5. **Cuenta FTP.** En *FTP Accounts* crea una cuenta cuyo directorio sea la **carpeta de la instancia**. Con eso `FTP_SERVER_DIR` vale `/`. Anota el servidor y el usuario; el protocolo es FTPS.
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
   ```

8. **`.htaccess`.** Copia el contenido de [`deploy/htaccess.sample`](../deploy/htaccess.sample) a `public/.htaccess`. Es de una sola vez: el despliegue nunca lo sube ni lo borra.
9. **Protección de directorio (opcional).** Si activas una clave de cPanel sobre el subdominio, guarda sus datos como `BASIC_AUTH_USER` y `BASIC_AUTH_PASSWORD` (ver 2.2).

### 2.2 En GitHub (una vez por entorno)

*Settings → Environments → New environment*, con el nombre `test` (y luego `soltec`).

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `FTP_SERVER` | Servidor FTP, por ejemplo `ftp.musicos-catolicos.com` |
| Secret | `FTP_USERNAME` | Usuario de la cuenta FTP |
| Secret | `FTP_PASSWORD` | Contraseña de la cuenta FTP |
| Secret | `FTP_SERVER_DIR` | `/` (si la cuenta FTP apunta a la carpeta de la instancia) |
| Secret | `DEPLOY_TOKEN` | El mismo valor que en el `.env` |
| Secret (opcional) | `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD` | Solo si hay protección de directorio |
| Variable | `APP_URL` | `https://test.musicos-catolicos.com` (sin barra final) |
| Variable (opcional) | `FTP_PROTOCOL` | `ftps` (es el valor por defecto) |

En `soltec` conviene activar *Required reviewers* para que cada despliegue pida aprobación.

### 2.3 El token de despliegue

Es una clave larga y aleatoria que protege los endpoints de migraciones y diagnóstico (mínimo 32 caracteres; sin ella quedan deshabilitados). Genérala en el terminal de cPanel:

```bash
php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
```

Pégala en el `.env` del servidor y en el secret `DEPLOY_TOKEN` del entorno de GitHub. Un token distinto por entorno. No la pegues en un chat.

## 3. Primer despliegue

1. Verifica que lo de la sección 2 está hecho.
2. GitHub → *Actions* → *Deploy* → *Run workflow* → elige la rama y el entorno `test`.
3. En el log, el paso **Apply migrations** (el primero) responde 404 y se tolera; el segundo debe responder `200` con la migración aplicada.
4. El paso **Smoke test** debe terminar en verde y mostrar el diagnóstico.
5. Abre `https://test.musicos-catolicos.com`: debe verse la pantalla vacía con «El servicio está en línea».

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

La entrega del correo (buzón de cPanel por SMTP hacia Gmail y Outlook) se verifica en un paso posterior, cuando se agregue el envío de correo.

## 5. Si algo falla

| Síntoma en el log | Causa probable |
|---|---|
| Migraciones: `503 deploy_token_not_configured` | El `.env` no tiene `DEPLOY_TOKEN`, o no está en la carpeta de la instancia |
| Migraciones: `503 deploy_token_too_short` | El token tiene menos de 32 caracteres |
| Migraciones: `401 unauthorized` | El secret `DEPLOY_TOKEN` no coincide con el del `.env` |
| Migraciones: `500 migration_failed` | El mensaje dice la causa; casi siempre credenciales o privilegios de la base de datos |
| Migraciones: responde 200 pero no es JSON | Falta el `.htaccess` o el API no llegó a `public/api/` |
| Smoke: `degraded` | La API responde pero la base de datos no: revisa `DB_*` en el `.env` |
| Smoke: 404 en `/api/v1/health` | Falta `.htaccess` o `mod_rewrite` |
