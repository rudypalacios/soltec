# ADR-0017: Invitación y recuperación de contraseña por enlace de correo

**Estado:** Aceptada · **Fecha:** 2026-10-09

## Contexto
La rebanada 1.1 creaba usuarios con una contraseña temporal que el administrador veía y entregaba. Eso expone una credencial a quien no debería conocerla y deja el medio de entrega a su criterio. ADR-0012 ya fija la recuperación por enlace; falta aplicar el mismo mecanismo al alta.

## Decisión
- **El administrador nunca ve una contraseña ni un enlace.** El alta crea la cuenta sin contraseña (`password_hash` NULL = invitación pendiente) y envía un correo con un enlace de un solo uso (72 h). Si el correo no sale, la cuenta existe igual y se reenvía; no hay contraseña de respaldo.
- **Mismo mecanismo para ambos enlaces** (`account_tokens`): `random_bytes(32)`, solo se guarda el SHA-256, un `UPDATE … WHERE used_at IS NULL AND expires_at > ahora` decide al ganador cuando dos peticiones llegan a la vez, y un enlace nuevo invalida los anteriores del mismo propósito.
- **El token va en el fragmento (`#token=`)**, que el navegador no envía al servidor ni en `Referer`; la web lo lee una vez y lo quita de la barra de direcciones. El enlace sale de `APP_URL`, nunca del `Host`.
- **Una contraseña débil no gasta el enlace:** la política se valida antes de consumirlo.
- **El estado de la cuenta se revisa al usar el enlace**, no al emitirlo: debe estar activa, y la invitación solo vale mientras esté pendiente. Cambiar el correo de un usuario invalida sus enlaces.
- **Recuperar solo funciona para cuentas activas que ya aceptaron su invitación.** `POST /auth/password/forgot` responde 204 siempre, y el trabajo (búsqueda, token, correo) se hace después de responder (`DeferredTasks`; `fastcgi_finish_request` cuando existe) para que ni el cuerpo ni el tiempo revelen si la cuenta existe. Un correo por minuto por cuenta. Restablecer quita el bloqueo y revoca todas las sesiones.
- **Reenviar la invitación sí es síncrono:** quien la pide es un administrador autenticado que necesita saber si falló (502 `mail_send_failed`, 503 `mail_not_configured`).

## Alternativas descartadas
- Contraseña temporal mostrada al administrador (rebanada 1.1): expone la credencial.
- Contraseña temporal por correo: la credencial viaja en claro y no vence.
- Token en la query: queda en logs del servidor y en `Referer`.

## Consecuencias
- `POST /v1/users` ya no acepta `initial_password` (cambio incompatible, aceptable antes de producción). `users.must_change_password` se conserva: sigue sirviendo si una futura política obliga a cambiar la clave.
- Sin `APP_URL` o sin correo configurado no se pueden dar de alta usuarios útiles; los requisitos del servidor (`/system/requirements`) ya lo verifican.
- Sin PHP-FPM (`fastcgi_finish_request` ausente) la respuesta de `forgot` espera a que termine el trabajo, y el tiempo vuelve a distinguir cuentas que existen: límite conocido; en el hosting objetivo hay FPM.
- El límite de un correo por minuto es por cuenta, no por IP: no frena el barrido de correos inexistentes (límite por IP en el servidor web, como en ADR-0012).
