# ADR-0003: Migraciones con Phinx ejecutadas por endpoint

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
No hay SSH en el hosting, solo FTPS. Todo cambio de esquema debe ser una migración versionada y aplicarse de forma automatizada en cada instancia.

## Decisión
- **Phinx**, invocado desde PHP.
- Un endpoint `POST /migrations/apply` protegido por token en cabecera (comparación en tiempo constante) y, opcionalmente, auth básica de cPanel. Responde con salida mínima.
- Un candado (`GET_LOCK`) evita ejecuciones simultáneas.
- Orden en el deploy: subir migraciones → aplicarlas → subir la aplicación → aplicar de nuevo (sin efecto salvo en el primer deploy). El primer deploy tolera 404/405.
- Cada entorno tiene su propia base de datos.

## Alternativas descartadas
- **Doctrine Migrations:** su ventaja principal (diff desde entidades del ORM) no aplica sin ORM.
- **MySQL remoto desde Actions:** las IP de los runners cambian y el acceso remoto no está garantizado.
- **SSH:** no disponible.

## Consecuencias
- Las migraciones se aplican antes que el código nuevo: deben ser **compatibles hacia atrás** con el código anterior.
- En MySQL el DDL no es transaccional: una migración fallida puede dejar el esquema a medias. Migraciones pequeñas y backup antes de cada deploy.
- El endpoint es superficie de ataque: el token es obligatorio y el endpoint queda deshabilitado si no está configurado.
