# ADR-0005: Actualizaciones por polling

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
Los requerimientos piden "tiempo real" (cobranza, progreso, chat, notificaciones). El hosting compartido no permite procesos persistentes. Node funciona en OrangeHost pero no en DreamHost, así que no es portable.

## Decisión
- **Polling** con TanStack Query: el navegador consulta periódicamente.
- Un endpoint agregado `GET /updates?since=…` devuelve contadores y cambios en una sola petición barata.
- Intervalos iniciales: ~60 s para notificaciones, 15-30 s para dashboards visibles, ~5 s con un chat abierto. Se pausa con la pestaña oculta.
- Una interfaz `RealtimeChannel` en `shared/` aísla el mecanismo, para cambiarlo sin tocar las pantallas.

## Alternativas descartadas
- **WebSockets propios:** requieren un proceso persistente (Ratchet, Swoole o Node); no portable.
- **Servicio externo (Pusher, Ably):** dependencia externa y límites de conexiones en el plan gratuito.
- **SSE:** ocupa un worker de PHP por conexión abierta.

## Consecuencias
- La latencia es de hasta un intervalo y hay carga constante en el servidor; los intervalos se ajustan midiendo.
- Para alertas urgentes (p. ej. emergencias) se evaluará Web Push además del polling.
