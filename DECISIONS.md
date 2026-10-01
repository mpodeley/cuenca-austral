# Registro de decisiones

Las decisiones importantes viven acá para que no queden escondidas en una conversación con el agente.

## D-001 — Proyecto aislado

Se trabaja exclusivamente en `/var/home/mpodeley/cuenca-austral` y no se reutiliza código ni datos de proyectos previos. Más adelante, con autorización explícita, se inspeccionaron sólo referencias de adquisición para localizar las fuentes públicas.

## D-002 — Aplicación estática

React, TypeScript, Vite y MapLibre permiten publicar en GitHub Pages sin servidor ni costo operativo. El pipeline prepara archivos que el navegador puede consumir directamente.

## D-003 — Datos derivados en Git

Los datos crudos pueden ser grandes y cambiar. Se excluyen de Git; los derivados, manifiestos y reportes se versionan. Así el producto es rápido y el proceso sigue siendo auditable.

## D-004 — Fixture honesto

El portal público puede estar caído o cambiar. Para no frenar el desarrollo existe un dataset sintético determinístico, rotulado dentro de la app. Nunca se usa como fallback silencioso de una actualización oficial.

## D-005 — Gas primero

El primer modelo se concentra en gas por su relevancia para la Cuenca Austral. Petróleo queda fuera del módulo inicial para evitar mezclar comportamientos y unidades.

## D-006 — Pronóstico transparente

Se usa Arps hiperbólico con transición a 5% anual. Los parámetros quedan visibles y editables. La elección favorece explicación y trazabilidad por encima de complejidad algorítmica.

## D-007 — Sin perforación implícita

El escenario de bloque comienza con cero pozos futuros. Cantidad, ritmo e inventario son supuestos explícitos del usuario.

## D-008 — Automatización revisable

La actualización mensual abre un pull request. Una persona revisa diferencias, manifiesto y calidad antes de integrar.

## D-009 — Resolver el nodo oficial correcto

La API federada de Datos Argentina devolvía resultados incompletos. El pipeline consulta el nodo directo `datos.energia.gob.ar`, filtra `cuenca=AUSTRAL` en DataStore y registra recursos inaccesibles sin sustituirlos por datos inventados.

## D-010 — Producto web compacto

El procesamiento y los acumulados usan 487.813 filas históricas. El navegador recibe como máximo los últimos 60 registros por pozo para reducir el artefacto de 40 MB a unos 17 MB sin perder la ventana usada por el ajuste didáctico.

## D-011 — Trayectorias ausentes, no fabricadas

La publicación nacional histórica de trayectorias dejó de responder y la publicación vigente localizada corresponde a Vaca Muerta. Se mantiene una capa GeoJSON vacía y una explicación visible hasta encontrar una fuente pública válida para Austral.
