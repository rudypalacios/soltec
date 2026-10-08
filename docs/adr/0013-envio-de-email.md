# ADR-0013: Envío de email: SMTP del proveedor del dominio, `mail()` como alternativa

**Estado:** Aceptada · reemplaza parcialmente a [ADR-0010](0010-email-smtp-por-instancia.md) (las credenciales ya no viven en la tabla de configuración) · **Fecha:** 2026-10-08

## Contexto
La recuperación de contraseña es crítica: es la salida cuando alguien queda bloqueado. En la primera instancia el correo de la organización (`@miempresa.com`) está en un servidor distinto al del cPanel, probablemente Google Workspace. Un correo enviado con `mail()` desde el hosting con el dominio de la organización sale desde una IP que el SPF de ese dominio no autoriza, y Gmail lo manda a spam o lo rechaza. Arreglarlo implicaría editar el DNS del correo de la organización, con el riesgo de afectar su correo normal.

## Decisión
- **PHPMailer** detrás de una interfaz `MailTransport` (con un transporte falso para los tests).
- Dos controladores, elegidos con `MAIL_DRIVER=smtp|mail` en el `.env` de cada instancia:
  - **`smtp`**: SMTP del proveedor donde vive el correo del dominio remitente, con un **buzón dedicado** (por ejemplo `notificaciones@miempresa.com`). Es lo recomendado cuando el correo del dominio está fuera del hosting, que es el caso de la primera instancia.
  - **`mail()`**: entrega al servidor de correo del hosting (Exim). Válido cuando el dominio remitente se aloja en el mismo hosting, y como plan B. Sin credenciales.
- Las credenciales SMTP viven solo en el `.env`, nunca en la base de datos. La configuración general guarda únicamente el remitente (nombre y dirección).
- El remitente debe ser un buzón o alias real del dominio autenticado: Gmail reescribe el remitente por la cuenta con la que se autentica.
- Encabezados saneados (sin saltos de línea en remitente, asunto ni destinatario).
- Se mantiene de ADR-0010: Web Push con VAPID, sin SMS en la v1.

## Alternativas descartadas
- **`mail()` con el dominio de la organización desde el hosting:** falla SPF mientras el correo esté en otro proveedor.
- **Corregir SPF y DKIM en el DNS del correo:** toca el correo corporativo; un error lo afecta.
- **Brevo / SES:** válidos, con costo o límites; quedan disponibles cambiando `MAIL_DRIVER` y el `.env`.

## Consecuencias
- Google Workspace limita el envío diario por buzón (del orden de 2.000 mensajes), más que suficiente para este volumen.
- La contraseña de aplicación exige verificación en dos pasos y el administrador del dominio puede deshabilitarla. Si pasara, el siguiente paso es OAuth2 para SMTP.
- Algunos hostings compartidos bloquean los puertos SMTP salientes: se verifica desde el servidor real durante el scaffolding.
- PHPMailer devuelve el error SMTP concreto, así que los fallos de envío son visibles en el log.
- Con `mail()` no hay confirmación de entrega ni rebotes, y depende de la reputación de la IP compartida.
