# Cuenca Austral, pozo por pozo

Aplicación educativa y auditable sobre concesiones, pozos y producción de gas en la Cuenca Austral argentina. Convierte datos públicos en un mapa interactivo, fichas por bloque, pozos tipo y pronósticos editables.

> El repositorio se construyó desde cero como material de un curso de IA aplicada a energía. La aplicación no reemplaza evaluaciones técnicas, económicas ni de reservas.

Si no programás, empezá por [COURSE.md](COURSE.md): explica cómo se dirigió y revisó al agente sin exigir conocimientos de código. Las decisiones del proyecto están en [DECISIONS.md](DECISIONS.md).

## Estado

La interfaz completa funciona con un dataset sintético determinístico claramente identificado como demostrativo. El pipeline oficial está preparado para resolver los recursos del catálogo de Datos Argentina, descargar las distribuciones vigentes y sustituir ese dataset mediante `npm run data:update`.

La separación es intencional: nunca se presenta un dato inventado como oficial y la interfaz se puede desarrollar aun cuando el portal público no está disponible.

## Inicio rápido

Requisitos: Node.js 22 o posterior y Python 3.11 o posterior.

```bash
npm install
npm run data:demo
npm run dev
```

La ruta local es `http://localhost:5173/cuenca-austral/`.

Para procesar el catálogo oficial:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run data:update
```

El comando falla de manera explícita si cambia el catálogo, falta un campo crítico o no encuentra registros válidos. Nunca reemplaza silenciosamente datos oficiales con el dataset demostrativo.

## Fuentes públicas

- [Producción de petróleo y gas por pozo — Capítulo IV](https://datos.gob.ar/dataset/energia-produccion-petroleo-gas-por-pozo-capitulo-iv)
- [Concesiones de explotación](https://datos.gob.ar/dataset/energia-produccion-hidrocarburos---concesiones-explotacion)
- [Cuencas sedimentarias](https://datos.gob.ar/dataset/energia-exploracion-hidrocarburos-cuencas-sedimentarias)
- [Información geográfica de la Secretaría de Energía](https://www.argentina.gob.ar/economia/energia/planeamiento-energetico/informacion-energetica/sistema-unificado-de-informacion-2)

Las declaraciones de producción pueden ser provisorias. El código tiene licencia MIT; los datos conservan las condiciones y atribución de sus organismos publicadores. Véase [DATA.md](DATA.md).

## Trazabilidad

`config/sources.json` declara fuentes, unidades y filtros. El pipeline guarda las descargas en `data/raw/`, que no se versiona, y publica:

| Archivo | Contenido |
| --- | --- |
| `public/data/dataset.json` | Contrato compacto que consume la aplicación |
| `data/processed/wells.csv` | Padrón normalizado de pozos |
| `data/processed/manifest.json` | Fuentes, checksums, versión y supuestos |
| `data/processed/quality-report.*` | Conteos, cobertura y controles de calidad |

Los identificadores internos son hashes determinísticos de los identificadores oficiales. Las coordenadas se validan contra límites argentinos y quedan en EPSG:4326. Cuando una geometría oficial no puede cruzarse, el pipeline usa una envolvente derivada de los pozos y lo registra como supuesto.

## Metodología de pronóstico

1. Se alinean los pozos por primer mes con producción positiva de gas.
2. La tasa mensual se divide por días productivos; si no están informados, se usan 30,4375 días.
3. Solo ingresan al pozo tipo series con al menos 12 meses. La interfaz alerta cuando hay menos de 10 pozos elegibles.
4. La curva central es la mediana mensual de tasas. El ajuste minimiza el error cuadrático en `log(1 + q)`.
5. Se usa Arps hiperbólico:

   `q(t) = qi / (1 + b · Di · t)^(1/b)`

6. Cuando la declinación efectiva alcanza 5% anual, continúa exponencialmente. El horizonte es de 20 años.
7. El pronóstico de bloque suma una declinación base de 12% anual y las altas definidas por el usuario. Por defecto hay cero pozos futuros.

Las bandas baja y alta son multiplicadores didácticos de 0,75× y 1,25× sobre la curva central; no son categorías de reservas ni probabilidades certificadas. Esta limitación se mantiene visible en el repositorio y será reemplazable por percentiles empíricos cuando la muestra oficial sea suficiente.

## Desarrollo y validación

```bash
python3 -m unittest pipeline.test_pipeline
npm test
npm run build
```

Los workflows ejecutan estos controles en cada cambio, publican `dist/` en GitHub Pages y abren mensualmente un pull request si cambian los datos oficiales.

## Estructura

```text
config/             fuentes, filtros y unidades
pipeline/           descarga, normalización, QA y fixtures
data/processed/     evidencia versionada
public/data/         artefacto consumido por la web
src/                 aplicación, mapa y modelos
.github/workflows/  CI, Pages y actualización mensual
```
