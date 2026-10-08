# ADR-0013: Email con `mail()` por defecto, SMTP opcional

**Estado:** Aceptada · reemplaza parcialmente a [ADR-0010](0010-email-smtp-por-instancia.md) (la parte de SMTP por defecto y de credenciales en la tabla de configuración) · **Fecha:** 2026-10-08

## Contexto
En otro proyecto se usó `mail()` de PHP, que entrega el mensaje al servidor de correo del hosting (en cPanel, normalmente Exim): sin SMTP, sin contraseñas y sin proveedor externo. El volumen es bajo (recuperación de contraseña, notificaciones, envío de documentos). La recuperación de contraseña es crítica: es la salida cuando alguien queda bloqueado.

## Decisión
- **PHPMailer con transporte `mail()` por defecto.** Cero credenciales que guardar.
- SMTP opcional, elegido con `MAIL_DRIVER=mail|smtp` en el `.env`. Las credenciales SMTP viven solo en el `.env`, nunca en la base de datos. La configuración general guarda únicamente el remitente (nombre y dirección).
- Una interfaz `MailTransport` aísla el envío, con un transporte falso para los tests.
- Encabezados saneados (sin saltos de línea en remitente, asunto ni destinatario).
- SPF, DKIM y DMARC configurados en cPanel (Email Deliverability) para el dominio de cada instancia.
- Se mantiene de ADR-0010: Web Push con VAPID, sin SMS en la v1.

## Alternativas descartadas
- **SMTP fijo:** agrega credenciales y configuración que hoy no hacen falta.
- **Gmail SMTP:** límites diarios y contraseña de aplicación u OAuth.
- **Brevo / SES:** válidos, con costo o límites; quedan disponibles cambiando `MAIL_DRIVER` y el `.env`.

## Consecuencias
- `mail()` devuelve verdadero si el mensaje se encoló, no si llegó: no hay confirmación de entrega ni rebotes, y los fallos solo quedan en el log.
- La entrega depende de la reputación de la IP compartida del hosting. En el primer despliegue se prueba el correo de recuperación contra Gmail y Outlook; si cae en spam, se pasa a SMTP con un buzón del dominio cambiando solo el `.env`.
- En una mudanza a DreamHost hay que verificar que `mail()` siga disponible.
