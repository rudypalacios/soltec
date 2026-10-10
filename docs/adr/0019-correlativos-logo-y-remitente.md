# ADR-0019: Correlativos atómicos, logo de la empresa y remitente de correo en el `.env`

**Estado:** Aceptada · reemplaza parcialmente a [ADR-0013](0013-envio-de-email.md) (el remitente ya no va en la configuración general) · **Fecha:** 2026-10-10

## Contexto
La rebanada 1.3 (configuración general) tiene tres puntos no obvios: los números de documento deben ser únicos aun con peticiones simultáneas (CLAUDE.md §4); el logo es una imagen subida por un usuario que el servidor guarda y sirve; y el remitente del correo, que el ADR-0013 mandaba a la configuración, ya funciona desde el `.env` y una pantalla solo permitiría desconfigurarlo.

## Decisión
**Correlativos.**
- Formato `PREFIJO-[PERIODO-]NÚMERO`, por ejemplo `COT-2610-0001` (año y mes, orden elegido por el usuario). El período de cada correlativo es `none`, `year` (`2026`) o `month` (`2610`), y el contador vuelve a 1 al cambiar. El período sigue el calendario de la empresa (`company.timezone`), no el UTC del servidor.
- `SequenceGenerator::next()` reserva con un solo `UPDATE … SET next_value = LAST_INSERT_ID(…) + 1`; el reinicio por período va dentro de la misma sentencia, así que dos peticiones en la medianoche no obtienen ambas el 1. Solo se acepta **dentro de una transacción** (falla si no la hay): el número vuelve con el rollback, **sin huecos**. El costo es que las altas del mismo tipo hacen cola hasta el commit, por lo que se llama lo más tarde posible.
- No sube `version`: emitir un documento no debe dejar obsoleto el formulario abierto de un administrador.
- Para que un número no se repita, el contador solo puede subir y el período no cambia una vez emitido un número. Prefijo y relleno sí, y solo afectan a los números futuros.

**Logo.**
- El cuerpo de la petición es la imagen (`PUT`), no un formulario multipart: hay un solo archivo y ningún otro campo.
- Se identifica por su contenido (PNG, JPEG o WebP), se rechaza todo lo demás, incluido SVG (servido desde el mismo origen puede llevar scripts), y **siempre se decodifica y se vuelve a codificar** en WebP de hasta 512 px, lo que elimina metadatos y datos añadidos tras la imagen. Se limita el tamaño del archivo (1 MB) y los píxeles (8 millones: lo que se reserva al decodificar).
- Vive en `storage/branding/logo-<hash>.webp`, fuera del alcance de la web; lo sirve la API (`/v1/branding/logo`, pública porque el inicio de sesión lo muestra) con `ETag`. `/v1/branding` expone solo el nombre comercial y la versión del logo.

**Remitente.** Queda en `MAIL_FROM_*` del `.env`. No hay tabla `mail_settings` ni pantalla: lo que no se puede desconfigurar desde la interfaz no se rompe por error. Cambiarlo exige editar el `.env` del servidor.

## Alternativas descartadas
- **Contador leído y luego escrito (o `MAX(número)+1`):** dos peticiones leen el mismo valor. La prueba de concurrencia con procesos reales lo detecta.
- **Reservar el número fuera de la transacción del documento:** nunca repite, pero un documento que falla deja un hueco.
- **Multipart y almacenar el archivo tal cual:** más código de borde y se guardarían los bytes del cliente, no los nuestros.
- **SVG sanitizado:** posible más adelante con un saneador probado; hoy el logo raster basta.

## Consecuencias
- Todo módulo que emita un número lo toma con `SequenceGenerator::next($code)` dentro de la transacción que crea el documento; su migración inserta su fila en `sequences`. Sus pruebas deben incluir el índice único del número como segunda defensa.
- Con la zona horaria `America/Guatemala` por defecto, el mes cambia a las 00:00 locales.
- `storage/branding/` entra en las copias de seguridad de la instancia; el despliegue ya no lo toca.
