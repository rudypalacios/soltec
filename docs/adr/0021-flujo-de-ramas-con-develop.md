# ADR-0021: Flujo de ramas con `develop`

**Estado:** Aceptada · **Fecha:** 2026-10-12

## Contexto
Todo PR iba a `main` con squash y cada fusión desplegaba a producción. No había dónde juntar varios cambios y correr la regresión completa (E2E, ADR-0020) antes de publicar.

## Decisión
- **`main` = producción; `develop` = integración** y rama por defecto de GitHub.
- **PR de trabajo:** salen de `develop`, van a `develop` con *squash and merge*. Corren las pruebas, el E2E de lo nuevo, y con `pre-deploy` despliegan a `staging` para el QA **antes** de fusionar.
- **Release:** PR `develop → main` con **commit de fusión**, nunca squash ni rebase. Al caer en `main` despliega a producción, como hoy.
- Fusionar en `develop` no despliega: corre el E2E completo.

## Alternativas descartadas
- **Squash también en el release:** `main` quedaría con un commit nuevo que `develop` no contiene; los historiales divergen y el siguiente release da conflictos en lo ya publicado.
- **Seguir con solo `main`:** no hay dónde acumular cambios ni correr la regresión completa antes de producción.
- **`staging` desde `develop`:** `staging` es compartido y un PR sin fusionar no tendría dónde probarse; se queda en el PR con `pre-deploy`.

## Consecuencias
- Hay dos fusiones distintas; el tipo se elige por destino. Un squash a `main` por error se corrige con un PR de reconciliación; conviene desactivar *squash* y *rebase* en las reglas de `main`.
- Producción sigue limitada a `main` (entorno `production`); `staging` debe aceptar las ramas de PR.
- Lo que hace el usuario en GitHub: proteger `develop` (pruebas y E2E obligatorios), permitir en `staging` el despliegue desde ramas de PR y limitar los métodos de fusión de `main` a *merge commit*.
