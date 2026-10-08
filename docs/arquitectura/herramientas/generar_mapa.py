"""Genera las secciones tabulares del mapa de módulos a partir de una sola fuente de datos.

Uso: python3 -I generar_mapa.py <archivo_de_salida>
Falla (exit 1) si una dependencia dura apunta a un módulo de un hito posterior o si hay ciclos.
"""
import sys

HITOS = {
    1: "Fundaciones",
    2: "Catálogo y clientes",
    3: "Tareas, tickets y cierre del legacy",
    4: "Cotizador",
    5: "Proyectos, compras e inventarios",
    6: "Facturación y finanzas",
    7: "Administración, soporte y reportes",
    8: "Móvil (PWA)",
    9: "Portal de cliente",
}

# slug, nombre, contenido, hito, dependencias duras, dependencias blandas
MODULOS = [
    ("acceso", "Acceso y permisos", "Usuarios, perfiles (roles) con permisos por módulo, login con JWT y refresh revocable, dispositivos", 1, [], []),
    ("org", "Organización", "Departamentos, jefe directo (jerarquía), alcance de datos: propio, equipo o todo", 1, ["acceso"], []),
    ("config", "Configuración general", "Datos de la empresa, IVA, ISR, días para marcar un costo desactualizado, validez de cotización (15 días), correlativos, SMTP", 1, ["acceso"], []),
    ("margen", "Niveles de margen y motor de precios", "Niveles de MC (uno por defecto) y fórmula de precio: costo con IVA → sin IVA → con IVA", 1, ["config"], []),
    ("audit", "Auditoría y desactivación lógica", "Registro de usuario, acción, fecha y valores antes/después; activo/inactivo en lugar de borrar", 1, ["acceso"], []),
    ("dash", "Dashboard base", "Contenedor y registro de widgets por perfil; cada hito agrega los suyos", 1, ["acceso", "org"], []),

    ("params", "Parámetros de catálogo", "CRUD genérico: tipo de contacto, estado de cliente, segmentos, régimen fiscal, formas de pago", 2, ["acceso", "audit"], []),
    ("catalogo", "Estructura del catálogo", "Marcas, áreas y grupos (cada grupo pertenece a un área)", 2, ["acceso", "audit"], []),
    ("contactos", "Contactos", "Personas con rol, asociadas a clientes o proveedores", 2, ["params"], []),
    ("proveedores", "Proveedores", "Datos fiscales, contactos, crédito; al desactivar, desactiva sus productos", 2, ["params", "contactos", "audit"], ["cotizador"]),
    ("productos", "Productos y paquetes", "Producto simple (costo con IVA, proveedor, área, grupo, marca) y paquete (productos × cantidad); precio calculado con el nivel de margen; alerta de costo desactualizado", 2, ["catalogo", "proveedores", "margen", "config"], []),
    ("clientes", "Clientes", "Prospecto y venta, NIT sin duplicados, vendedor asignado, contactos; conversión manual hasta que exista el Cotizador", 2, ["params", "contactos", "org"], []),

    ("estados", "Motor de estados", "Estados y transiciones configurables con banderas semánticas (p. ej. aceptada, terminal); un estado nuevo aplica solo a registros futuros", 3, ["acceso", "audit"], []),
    ("hilo", "Hilo de actividad", "Comentarios, cambios de estado y menciones sobre cualquier registro; bandera interno/externo desde el inicio", 3, ["acceso"], ["archivos"]),
    ("notif", "Notificaciones", "Configurables por perfil y departamento; en la aplicación y por email; endpoint de actualizaciones para el polling", 3, ["acceso", "org", "config"], []),
    ("archivos", "Archivos y fotos", "Almacenamiento local, compresión, WebP normal y miniatura, metadatos en JSON", 3, ["acceso"], []),
    ("tareas", "Tareas", "Lista de pendientes: asignada a alguien, estado, fecha de vencimiento, hilo", 3, ["acceso", "org", "estados", "hilo", "notif"], []),
    ("tickets", "Tickets (helpdesk mínimo)", "Cliente, asignado, estado, descripción e hilo; los campos extendidos se agregan después con migraciones", 3, ["clientes", "estados", "hilo", "notif"], []),
    ("legacy", "Importación y cierre del legacy", "Importadores (corrigen la codificación) de usuarios, configuración, márgenes, catálogo, proveedores, clientes, tareas y tickets; prueba paralela y apagado del legacy", 3, ["acceso", "config", "margen", "catalogo", "proveedores", "productos", "clientes", "tareas", "tickets"], []),

    ("cotizador", "Cotizador", "Ofertas y plantillas, estados configurables, validez de 15 días, precios y composición congelados, PDF, versiones, conversión prospecto → cliente al aceptar", 4, ["productos", "clientes", "margen", "config", "estados", "contactos", "org"], ["inventarios"]),

    ("aprobaciones", "Motor de reglas de aprobación", "Reglas configurables (monto, cliente nuevo, anticipo, perfil) y aprobador", 5, ["estados", "org", "config"], []),
    ("proyectos", "Proyectos y plantillas", "Plantillas de tipo de proyecto (etapas y actividades ponderadas), conversión oferta → proyecto, avance ponderado", 5, ["cotizador", "clientes", "estados", "tareas", "aprobaciones", "hilo", "org"], []),
    ("inventarios", "Inventarios y bodegas", "Bodegas, saldos y movimientos", 5, ["productos", "audit"], []),
    ("compras", "Compras y órdenes de compra", "Solicitud con paquetes desglosados, comparación bodega/ofertado/solicitado, OC en PDF por proveedor", 5, ["proyectos", "inventarios", "proveedores", "productos", "config"], []),

    ("facturacion", "Facturación", "Facturación flexible por etapa; FEL si aplica", 6, ["proyectos", "clientes", "config"], []),
    ("cxc", "Cuentas por cobrar", "Cobros, anticipos, cobros parciales, vencimientos", 6, ["facturacion", "clientes"], []),
    ("cxp", "Cuentas por pagar", "Seguimiento por proveedor y antigüedad de saldos", 6, ["compras", "proveedores"], []),
    ("rentab", "Costo real y rentabilidad", "Costo real por proyecto y rentabilidad", 6, ["proyectos", "compras", "facturacion"], []),

    ("bancos", "Bancos y conciliación", "Cuentas, saldos y conciliación", 7, ["cxc", "cxp"], []),
    ("rrhh", "RRHH y comisiones", "Empleados, prestaciones, motor de comisiones configurable", 7, ["acceso", "proyectos", "cxc"], []),
    ("reportes", "Reportes e indicadores", "Pipeline, cobranza, ventas, márgenes y metas", 7, ["cotizador", "proyectos", "cxc", "cxp", "rentab"], []),
    ("helpdesk", "Helpdesk extendido y mantenimiento", "Equipos vendidos, contratos, SLA, prioridad y aviso de emergencias", 7, ["tickets", "proyectos", "clientes"], []),
    ("reuniones", "Sala de reuniones", "Proyectos internos y minutas", 7, ["tareas", "acceso"], []),

    ("movil", "Móvil: offline, ubicación y chat", "Sincronización con dispositivos, geolocalización, chat de proyecto", 8, ["acceso", "tareas", "tickets", "clientes", "archivos", "notif", "proyectos"], []),

    ("portal", "Portal de cliente", "Vista de lo propio, facturación, progreso y comunicación por proyecto", 9, ["clientes", "proyectos", "facturacion", "hilo", "notif", "acceso"], []),
]

ids = {m[0]: f"{i + 1:02d}" for i, m in enumerate(MODULOS)}
hito_de = {m[0]: m[3] for m in MODULOS}
orden = {m[0]: i for i, m in enumerate(MODULOS)}


def validar():
    errores = []
    for slug, _, _, hito, duras, _ in MODULOS:
        for dep in duras:
            if dep not in ids:
                errores.append(f"{slug}: dependencia desconocida '{dep}'")
            elif hito_de[dep] > hito:
                errores.append(f"{slug} (hito {hito}) depende de {dep} (hito {hito_de[dep]})")
            elif orden[dep] >= orden[slug]:
                errores.append(f"{slug} depende de {dep}, que está definido después en el mismo hito")
    return errores


def blandas_fuera_de_orden():
    salida = []
    for slug, nombre, _, hito, _, blandas in MODULOS:
        for dep in blandas:
            if hito_de[dep] > hito:
                salida.append((slug, dep))
    return salida


def inventario():
    filas = []
    for hito, titulo in HITOS.items():
        filas.append(f"\n### Hito {hito} — {titulo}\n")
        filas.append("| ID | Módulo | Contenido | Depende de | Depende de (blanda) |")
        filas.append("|----|--------|-----------|------------|---------------------|")
        for slug, nombre, contenido, h, duras, blandas in MODULOS:
            if h != hito:
                continue
            d = ", ".join(ids[x] for x in duras) or "—"
            b = ", ".join(ids[x] for x in blandas) or "—"
            filas.append(f"| {ids[slug]} | {nombre} | {contenido} | {d} | {b} |")
    return "\n".join(filas)


def matriz():
    cab = ["Módulo \\ requiere"] + [ids[m[0]] for m in MODULOS]
    filas = ["| " + " | ".join(cab) + " |", "|" + "---|" * len(cab)]
    for slug, nombre, _, _, duras, blandas in MODULOS:
        celdas = []
        for otro in MODULOS:
            s = otro[0]
            celdas.append("●" if s in duras else ("○" if s in blandas else ""))
        filas.append(f"| {ids[slug]} {nombre} | " + " | ".join(celdas) + " |")
    return "\n".join(filas)


def diagrama():
    omitidos = {"acceso", "audit", "config"}
    lineas = ["```mermaid", "flowchart LR"]
    for hito, titulo in HITOS.items():
        lineas.append(f'  subgraph H{hito}["Hito {hito}: {titulo}"]')
        for slug, nombre, _, h, _, _ in MODULOS:
            if h == hito:
                lineas.append(f'    {slug}["{ids[slug]} {nombre}"]')
        lineas.append("  end")
    for slug, _, _, _, duras, blandas in MODULOS:
        for dep in duras:
            if dep not in omitidos:
                lineas.append(f"  {dep} --> {slug}")
        for dep in blandas:
            lineas.append(f"  {dep} -.-> {slug}")
    lineas.append("```")
    return "\n".join(lineas)


if __name__ == "__main__":
    errores = validar()
    if errores:
        print("\n".join(errores), file=sys.stderr)
        sys.exit(1)
    fuera = blandas_fuera_de_orden()
    partes = [
        "## 2. Inventario de módulos\n",
        "Las dependencias duras (●) son las que obligan el orden de construcción. Las blandas (○) son mejoras que pueden esperar sin bloquear el módulo.",
        inventario(),
        "\n## 3. Diagrama de dependencias\n",
        "Línea continua: dependencia dura. Línea punteada: dependencia blanda. Para que se lea, el diagrama omite las flechas hacia 01 Acceso y permisos, 03 Configuración general y 05 Auditoría, que casi todos los módulos usan; están completas en la matriz.\n",
        diagrama(),
        "\n## 4. Matriz de dependencias\n",
        "Cada fila es un módulo y cada columna un módulo del que depende (● dura, ○ blanda).\n",
        matriz(),
        "\n## 5. Validación del orden\n",
        f"Resultado automático sobre {len(MODULOS)} módulos: **ninguna dependencia dura apunta a un hito posterior y no hay ciclos.**\n",
        "Dependencias blandas que van contra el orden (ver ajustes en la sección 6):\n",
    ]
    for slug, dep in fuera:
        partes.append(f"- {ids[slug]} {MODULOS[orden[slug]][1]} → {ids[dep]} {MODULOS[orden[dep]][1]} (hito {hito_de[slug]} → hito {hito_de[dep]})")
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        f.write("\n".join(partes) + "\n")
    print(f"OK: {len(MODULOS)} módulos; blandas fuera de orden: {len(fuera)}")
