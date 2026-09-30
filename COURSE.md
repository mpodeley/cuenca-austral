# Guía del curso: crear una app con agentes sin ser programador

Este repositorio es simultáneamente un producto y un registro de aprendizaje. La idea no es copiar código: es entender cómo dirigir, revisar y limitar a un agente de coding.

## 1. Empezar por el problema

El pedido inicial definió cinco cosas que una persona experta en el dominio sí conoce:

1. Región: Cuenca Austral argentina, onshore y offshore.
2. Usuarios: asistentes de un curso de IA aplicada a energía.
3. Producto: mapa, fichas, pozos tipo y pronósticos.
4. Restricción: fuentes públicas y supuestos visibles.
5. Entrega: repositorio público, Git y GitHub Pages.

No hizo falta indicar componentes de React, estructuras de carpetas ni comandos. Esas decisiones técnicas fueron propuestas por el agente y quedaron revisables en Git.

## 2. Trabajar en incrementos observables

El proyecto se dividió en entregables pequeños:

- Pipeline que puede fallar de manera clara.
- Dataset demostrativo para no bloquear la interfaz.
- Mapa y selección de áreas.
- Ficha con indicadores.
- Modelo de declinación y escenario de bloque.
- Documentación, pruebas y publicación.

Cada incremento tiene un criterio observable. “Terminamos el pipeline” no significa que existe un archivo Python: significa que una ejecución produce artefactos, manifiesto y reporte, y que las pruebas pasan.

## 3. Qué pedirle a un agente

Un buen pedido describe resultados y restricciones:

```text
Agregá una ficha por bloque. Debe mostrar la fuente y fecha de corte,
no debe inventar valores faltantes y tiene que funcionar en móvil.
Implementá pruebas y documentá cualquier supuesto nuevo.
```

Un pedido débil se limita a “hacelo lindo” o enumera tecnologías sin explicar el resultado buscado.

## 4. Cómo revisar sin leer todo el código

Una persona no programadora puede verificar:

- La app abre y los controles hacen lo que describen.
- El badge distingue datos oficiales de demostrativos.
- `manifest.json` enumera fuentes y huellas digitales.
- `quality-report.md` informa cuántos registros pasaron los controles.
- La pestaña Actions de GitHub muestra pruebas verdes o errores concretos.
- El historial de commits cuenta una secuencia comprensible.
- Un cambio de supuesto aparece en `DECISIONS.md` o `DATA.md`.

## 5. Guardrails usados

- Directorio y repositorio nuevos; no se reutilizaron otros proyectos.
- Los datos crudos no se versionan, pero sí su procedencia y los derivados.
- Si la fuente pública falla, la app usa únicamente un fixture explícitamente sintético.
- El forecast parte de cero pozos futuros.
- Los cambios automáticos de datos abren un pull request; no escriben directamente en `main`.
- Las vulnerabilidades de dependencias se auditan antes de publicar.

## 6. Preguntas para discutir en clase

1. ¿Qué parte necesitó conocimiento del dominio y cuál pudo delegarse?
2. ¿Cómo detectarían un error de unidades sin leer Python?
3. ¿Qué supuesto del modelo genera mayor sensibilidad?
4. ¿Qué debería revisar una persona antes de aceptar el PR mensual?
5. ¿Qué cambia si la app se usa para una decisión económica real?

## 7. Próximos ejercicios

- Reemplazar las bandas 0,75×/1,25× por percentiles empíricos con muestra suficiente.
- Incorporar petróleo sin mezclar unidades.
- Comparar Arps con otro modelo y explicar la métrica de selección.
- Agregar descarga de escenarios con todos sus supuestos.
- Escribir un test que reproduzca un error de datos real encontrado durante la actualización.

