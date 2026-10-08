# ADR-0004: Despliegue por FTPS con GitHub Actions

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
Dos entornos ya existen: `test.musicos-catolicos.com` y `soltec.musicos-catolicos.com`, cada uno con su base de datos. El desarrollo se hace desde Claude Code; no hay Docker local. Hay un flujo de referencia de otro proyecto (`deploy.yml` y `migrate.sh`).

## Decisión
- **GitHub Actions** con `SamKirkland/FTP-Deploy-Action` por FTPS, que sube solo lo que cambió.
- Un push a una rama de trabajo despliega al entorno **staging** (`test.musicos-catolicos.com`); el merge a la rama de producción despliega a **production** (`soltec.musicos-catolicos.com`). La rama de producción es `main`. El entorno `production` de GitHub solo admite `main`. El workflow Deploy se dispara con cada push; también puede lanzarse a mano con la misma regla.
- CI instala dependencias (`composer --no-dev`), compila `web/` y sube `api/` (con `vendor/`) y el build del frontend. Nunca sube `.env`, `.htaccess`, logs ni archivos de desarrollo.
- Secretos y URL por entorno (GitHub Environments). `concurrency` por entorno para no desplegar dos veces a la vez.
- Los tests corren contra un servicio MySQL 5.7 antes de desplegar.
- En staging, una rama a la vez (la última que se subió), con acción manual para resetear su base de datos.
- Web en `/` y API en `/api/v1` bajo el mismo subdominio (sin CORS, refresh token en cookie httpOnly). La versión en la ruta permite migrar la API poco a poco. *(Confirmado.)*

## Alternativas descartadas
- Deploy manual por FTP: sin trazabilidad ni tests.
- Rsync/SSH: no disponible.

## Consecuencias
- El FTP no es atómico: durante la subida el sitio puede estar a medias (se usa un archivo de mantenimiento).
- Las migraciones de ramas sin terminar tocan solo la base de staging, nunca producción.
