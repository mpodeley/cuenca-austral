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
- El encabezado dice hasta qué mes llegan los datos.
- `manifest.json` dice de qué archivo oficial salió cada año.
- `quality-report.md` informa cuántos registros pasaron los controles.
- La pestaña Actions de GitHub muestra pruebas verdes o errores concretos.
- El historial de commits cuenta una secuencia comprensible.
- Un cambio de supuesto aparece en `DECISIONS.md` o `DATA.md`.

## 5. Cuando el resultado no es lo que se pidió

La primera versión de esta app no cumplía el pedido, y eso es parte del material.

**Qué pasó.** El pedido decía "una aplicación similar a vm.podeley.ar". El agente entregó un mapa a pantalla completa con una ficha de cuatro números, sólo gas, sin ficha de pozo, y con datos a los que les faltaban años enteros. Sus mensajes finales decían "publicada y funcionando", las pruebas pasaban y el reporte de calidad decía "pass".

**Cómo se detectó.** La persona abrió la app, la comparó con la referencia y vio que no se parecía; no hizo falta leer código. Los años faltantes aparecieron después, al sumar la producción de la cuenca mes a mes: 2024 y 2025 daban una fracción mínima de 2023.

**Cómo se corrigió.** Un segundo agente empezó por recuperar el pedido original palabra por palabra y por describir la referencia en detalle, antes de tocar nada. Recién entonces comparó, listó las diferencias y propuso un plan. Los datos faltantes resultaron ser un problema de la vía de acceso a la fuente, no del código de cálculo.

**Qué enseña.**

- Un ejemplo concreto ("como esta app") es la mejor especificación, y hay que volver a él al revisar.
- "Las pruebas pasan" sólo vale lo que valen las pruebas. Un control que no mira lo importante da una falsa tranquilidad.
- Conviene pedirle al agente que diga qué *no* pudo hacer. La primera versión lo decía, pero en la mitad de un mensaje largo.
- Los permisos también son parte del proceso: el segundo agente no pudo copiar código de un repositorio privado a uno público, lo informó y preguntó cómo seguir.

## 6. Cómo usar la app en clase

- **Modo clase** (arriba a la derecha): resalta cada módulo y muestra el botón `</> cómo se hizo` con su etiqueta. Cada botón abre un panel con qué hace el módulo, cómo se calcula, el recorrido del dato y links al código.
- **Links directos**: agregar `?como=<id>` a cualquier dirección abre ese panel. Por ejemplo, `#/campo?como=campo-tipo` abre la ficha con la explicación del pozo tipo. Los ids están en [ARCHITECTURE.md](ARCHITECTURE.md).
- **Cómo se hizo → Proceso**: los pedidos textuales, qué hizo cada agente, qué salió y cuántos tokens costó cada etapa.
- **Cómo se hizo → Arquitectura**: el esquema de la fuente pública a la pantalla. Elegir un módulo muestra de dónde sale su dato.
- **Un dato, de punta a punta** y **El modelo, para tocar**: para explicar el ajuste de Arps y el pronóstico moviendo controles, sin fórmulas en el pizarrón.

## 7. Guardrails usados

- Repositorio nuevo. La app de referencia se usó como especificación; su código no se copió.
- Los datos crudos no se versionan, pero sí su procedencia y los derivados.
- Si la fuente pública falla o le falta un mes, el build se corta: no se publica nada a medias.
- Los supuestos del pronóstico están a la vista y se pueden mover.
- Los cambios automáticos de datos abren un pull request; no escriben directamente en `main`.
- Las vulnerabilidades de dependencias se auditan antes de publicar.

## 8. Preguntas para discutir en clase

1. ¿Qué parte necesitó conocimiento del dominio y cuál pudo delegarse?
2. ¿Cómo detectarían un error de unidades sin leer Python?
3. ¿Qué supuesto del modelo genera mayor sensibilidad?
4. ¿Qué debería revisar una persona antes de aceptar el PR mensual?
5. ¿Qué cambia si la app se usa para una decisión económica real?

## 9. Próximos ejercicios

- Sumar la producción anterior a 2006 desde las series históricas por yacimiento.
- Contrastar el EUR por bloque con las reservas certificadas publicadas.
- Agregar capacidad de gasoductos y plantas como límite del pronóstico.
- Comparar Arps con otro modelo y explicar la métrica de selección.
- Escribir un test que reproduzca un error de datos real encontrado durante una actualización.
