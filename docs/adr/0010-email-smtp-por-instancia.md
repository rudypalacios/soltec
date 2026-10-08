# ADR-0010: Email por SMTP configurable por instancia

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
Se necesita enviar correos (notificaciones, cotizaciones) de forma gratuita y estable, desde el servidor. Cada instancia es una empresa distinta con su propio dominio.

## Decisión
- SMTP configurable por instancia (servidor, puerto, usuario, contraseña cifrada) en la tabla de configuración.
- Por defecto, el SMTP del propio hosting con el dominio de la empresa, con SPF y DKIM configurados para evitar spam.
- Librería: **PHPMailer** (ligera).
- Push: Web Push (VAPID), sin proveedor. En iOS solo funciona con la PWA instalada.
- SMS queda fuera de la v1.

## Alternativas descartadas
- **Gmail SMTP:** límites diarios, requiere contraseña de aplicación u OAuth y la entregabilidad es frágil.
- **Brevo / SES:** válidos, pero con costo o límites; quedan disponibles cambiando solo la configuración.

## Consecuencias
- Por verificar: el tope de correos por hora del hosting.
- Cambiar de proveedor de correo no requiere cambios de código.
