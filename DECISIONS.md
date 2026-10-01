# Registro de decisiones

Las decisiones importantes viven acá para que no queden escondidas en una conversación con el agente.

## D-001 — Proyecto aislado (reemplazada por D-012)

Se trabaja exclusivamente en `/var/home/mpodeley/cuenca-austral` y no se reutiliza código ni datos de proyectos previos. Más adelante, con autorización explícita, se inspeccionaron sólo referencias de adquisición para localizar las fuentes públicas.

## D-002 — Aplicación estática (MapLibre reemplazado en D-015)

React, TypeScript, Vite y MapLibre permiten publicar en GitHub Pages sin servidor ni costo operativo. El pipeline prepara archivos que el navegador puede consumir directamente.

## D-003 — Datos derivados en Git

Los datos crudos pueden ser grandes y cambiar. Se excluyen de Git; los derivados, manifiestos y reportes se versionan. Así el producto es rápido y el proceso sigue siendo auditable.

## D-004 — Fixture honesto (retirada)

El portal público puede estar caído o cambiar. Para no frenar el desarrollo existe un dataset sintético determinístico, rotulado dentro de la app. Nunca se usa como fallback silencioso de una actualización oficial.

## D-005 — Gas primero (reemplazada por D-014)

El primer modelo se concentra en gas por su relevancia para la Cuenca Austral. Petróleo queda fuera del módulo inicial para evitar mezclar comportamientos y unidades.

## D-006 — Pronóstico transparente (parámetros actualizados en D-016)

Se usa Arps hiperbólico con transición a 5% anual. Los parámetros quedan visibles y editables. La elección favorece explicación y trazabilidad por encima de complejidad algorítmica.

## D-007 — Sin perforación implícita (reemplazada por D-016)

El escenario de bloque comienza con cero pozos futuros. Cantidad, ritmo e inventario son supuestos explícitos del usuario.

## D-008 — Automatización revisable

La actualización mensual abre un pull request. Una persona revisa diferencias, manifiesto y calidad antes de integrar.

## D-009 — Resolver el nodo oficial correcto (reemplazada por D-013)

La API federada de Datos Argentina devolvía resultados incompletos. El pipeline consulta el nodo directo `datos.energia.gob.ar`, filtra `cuenca=AUSTRAL` en DataStore y registra recursos inaccesibles sin sustituirlos por datos inventados.

## D-010 — Producto web compacto (reemplazada por D-013)

El procesamiento y los acumulados usan 487.813 filas históricas. El navegador recibe como máximo los últimos 60 registros por pozo para reducir el artefacto de 40 MB a unos 17 MB sin perder la ventana usada por el ajuste didáctico.

## D-011 — Trayectorias ausentes, no fabricadas

La publicación nacional histórica de trayectorias dejó de responder y la publicación vigente localizada corresponde a Vaca Muerta. Se mantiene una capa GeoJSON vacía y una explicación visible hasta encontrar una fuente pública válida para Austral.

---

Las decisiones que siguen son de la segunda versión (octubre de 2026). La primera no cumplía el pedido: se revisó contra el pedido original y contra la app de referencia, y se rehízo.

## D-012 — La referencia manda

El pedido original era "una aplicación similar a vm.podeley.ar". La primera versión cumplía la lista de funciones pero no se parecía a la referencia. La segunda replica su formato: informe con pestañas (Mapa, Yacimiento, Pronóstico, Pozos), fichas densas, mapa SVG propio y la misma identidad visual. Se escribió de cero en este repositorio, tomando la referencia publicada como especificación y sin copiar su código, que es privado.

## D-013 — CSV completos en lugar de la API de consulta

La API DataStore devolvía 404 para 2014, 2015 y 2017 y cargas parciales para 2024 y 2025. Los CSV anuales estaban completos. El pipeline ahora los lee por streaming y guarda un store compacto de toda la historia en `data/store/`. El navegador recibe la historia completa, repartida en archivos que se cargan cuando hacen falta, en lugar de un único archivo de 17 MB recortado a 60 meses.

## D-014 — Gas y petróleo

Todas las vistas tienen ambos fluidos. Cada pozo y cada bloque tiene un fluido principal, definido por energía acumulada.

## D-015 — Mapa SVG sin teselas

El mapa no depende de servicios externos: tierra firme y límites vienen de Natural Earth y se publican con la app. Los pozos son puntos; las concesiones se pueden colorear por métrica.

## D-016 — Pronóstico por escenarios

El pronóstico suma la base declinante (cada pozo sigue su propia curva) y pozos nuevos al ritmo histórico de cada campo, con tres escenarios y supuestos editables. La declinación terminal pasa a 8 % anual. No se modelan límites de evacuación: no hay datos públicos curados para la cuenca. El inventario por defecto es un supuesto visible, no una estimación de locaciones.

## D-017 — El control de calidad mira el tiempo

El reporte anterior decía "pass" con 17 meses casi vacíos, porque sólo revisaba identificadores y coordenadas. Ahora el build falla si falta un mes o si el total de la cuenca cae abruptamente, y hay pruebas que lo verifican sobre los archivos publicados.

## D-018 — Sin datos sintéticos

Se retira el modo demostración. La app sólo muestra datos oficiales procesados.

## D-019 — Un registro único para explicar la app

Cada módulo de la app tiene un botón «cómo se hizo» que abre qué hace, cómo se calcula, el recorrido de su dato y los links a su código. Todo sale de un solo registro (`src/didactica/datos/`), que también genera el esquema interactivo de arquitectura y `ARCHITECTURE.md`. Un script calcula en qué línea está cada función citada y una prueba falla si un archivo o función deja de existir: los links al repositorio no se pueden pudrir en silencio.

## D-020 — El proceso se muestra tal cual fue

La página Proceso publica los pedidos de la persona textuales, con sus errores de tipeo, y los tokens que consumió cada etapa. Los totales se leen de los registros locales de las sesiones con `scripts/tokens_sesiones.py`; sólo se publican sumas por etapa, no el contenido de las conversaciones.
