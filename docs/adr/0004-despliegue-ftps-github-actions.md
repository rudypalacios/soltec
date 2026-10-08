# ADR-0004: Despliegue por FTPS con GitHub Actions

**Estado:** Propuesta · **Fecha:** 2026-10-08

## Contexto
Dos entornos ya existen: `test.musicos-catolicos.com` y `soltec.musicos-catolicos.com`, cada uno con su base de datos. El desarrollo se hace desde Claude Code; no hay Docker local. Hay un flujo de referencia de otro proyecto (`deploy.yml` y `migrate.sh`).

## Decisión
- **GitHub Actions** con `SamKirkland/FTP-Deploy-Action` por FTPS, que sube solo lo que cambió.
- Un push a una rama de trabajo despliega a **test**; el merge a la rama de producción despliega a **soltec**. Nombre de la rama de producción: *por definir*.
- CI instala dependencias (`composer --no-dev`), compila `web/` y sube `api/` (con `vendor/`) y el build del frontend. Nunca sube `.env`, `.htaccess`, logs ni archivos de desarrollo.
- Secretos y URL por entorno (GitHub Environments). `concurrency` por entorno para no desplegar dos veces a la vez.
- Los tests corren contra un servicio MySQL 5.7 antes de desplegar.
- En test, una rama a la vez, con acción manual para resetear su base de datos.
- Por confirmar: web en `/` y API en `/api` bajo el mismo subdominio (sin CORS, refresh token en cookie httpOnly).

## Alternativas descartadas
- Deploy manual por FTP: sin trazabilidad ni tests.
- Rsync/SSH: no disponible.

## Consecuencias
- El FTP no es atómico: durante la subida el sitio puede estar a medias (se usa un archivo de mantenimiento).
- Las migraciones de ramas sin terminar tocan solo la base de test, nunca producción.
