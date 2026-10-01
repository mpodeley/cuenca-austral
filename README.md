# Cuenca Austral, pozo por pozo

Aplicación educativa y auditable sobre concesiones, pozos y producción de gas y petróleo en la Cuenca Austral argentina. Convierte datos públicos en un mapa, una ficha por bloque, la declinación de cada pozo, pozos tipo y un pronóstico con supuestos editables.

**Sitio:** https://mpodeley.github.io/cuenca-austral/

> El repositorio es material de un curso de IA aplicada a energía y se construyó conversando con agentes de código. La aplicación no reemplaza evaluaciones técnicas, económicas ni de reservas.

Si no programás, empezá por [COURSE.md](COURSE.md): cuenta cómo se dirigió y revisó a los agentes, incluida una primera versión que no cumplía el pedido y cómo se corrigió. Las decisiones están en [DECISIONS.md](DECISIONS.md).

## Qué tiene

| Pestaña | Contenido |
| --- | --- |
| Mapa | Concesiones y pozos sobre la costa y el contorno de cuenca. Bloques coloreables por producción, EUR, agotamiento o actividad; pozos por estado, fluido, campaña, ambiente o tipo |
| Yacimiento | Ficha por campo o por operadora: indicadores, mapa, historia de producción, actividad por campaña, pozo tipo con banda P90–P10 y distribución de EUR |
| Pronóstico | Cuenca o campo: base declinante más pozos nuevos, tres escenarios, supuestos editables, programa campo por campo y descarga CSV |
| Pozos | Tabla buscable y ordenable, declinación con ajuste de Arps y banda, ficha del pozo y descarga CSV |
| Metodología | Cada regla de cálculo, con sus umbrales y limitaciones |
| Cómo se hizo | Proceso con los pedidos textuales y los tokens por etapa, esquema interactivo de arquitectura, un dato seguido de punta a punta, el modelo para tocar y los enlaces para auditar |

Cada módulo tiene un botón `</>` que abre cómo se hizo: qué hace, cómo se calcula, el recorrido del dato y links a su código. El **modo clase** los resalta. El mismo mapa módulo → código está en [ARCHITECTURE.md](ARCHITECTURE.md).

## Estado de los datos

**65 áreas, 3.236 pozos y 699.366 registros pozo-mes, de enero de 2006 a agosto de 2026, sin meses faltantes.** El control de calidad está en [`data/processed/quality-report.md`](data/processed/quality-report.md) y el origen de cada año en [`data/processed/manifest.json`](data/processed/manifest.json).

## Inicio rápido

Requisitos: Node.js 22 o posterior. Los datos procesados ya están en el repositorio.

```bash
npm install
npm run dev
```

La ruta local es `http://localhost:5173/cuenca-austral/`.

Para rehacer los datos hace falta Python 3.11 o posterior:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pipeline.fetch_capiv     # producción; la primera vez baja ~6 GB por streaming
.venv/bin/python -m pipeline.fetch_geo       # pozos, concesiones, cuenca y costa
.venv/bin/python -m pipeline.build_data      # ajustes, fichas, pozos tipo y control de calidad
```

`fetch_capiv` sólo vuelve a bajar el año en curso y el anterior; `--all` revisa todos los años cuyo archivo haya cambiado. `build_data` falla si falta un mes o si el total de la cuenca cae abruptamente.

## Fuentes públicas

- [Producción de petróleo y gas por pozo — Capítulo IV](https://datos.energia.gob.ar/dataset/produccion-de-petroleo-y-gas-por-pozo): producción mensual, padrón de pozos con coordenadas y padrón de primera producción.
- [Concesiones de explotación](https://datos.energia.gob.ar/dataset/produccion-hidrocarburos-concesiones-de-explotacion): polígonos.
- [Cuencas sedimentarias](https://datos.energia.gob.ar/dataset/exploracion-hidrocarburos-cuencas-sedimentarias): contorno de la cuenca.
- [Natural Earth](https://www.naturalearthdata.com/) (dominio público): tierra firme y límite internacional.

Las declaraciones de producción pueden ser provisorias. El código tiene licencia MIT; los datos conservan las condiciones y atribución de sus organismos publicadores. Véase [DATA.md](DATA.md).

## Trazabilidad

| Archivo | Contenido |
| --- | --- |
| `data/store/capiv_austral.json.gz` | Producción mensual por pozo de toda la cuenca, compacta |
| `data/store/geo/` | Pozos, concesiones, cuenca y contexto geográfico |
| `public/data/blocks.json` | Ficha de cada bloque y supuestos del cálculo |
| `public/data/wells.json`, `wells.csv` | Un registro por pozo: atributos, ajuste de Arps y EUR |
| `public/data/well_series.json` | Tasas mensuales de cada pozo |
| `public/data/forecast.json` | Historia, base declinante y pozo tipo por bloque |
| `public/data/concesiones_austral.json`, `contexto.json` | Geometría del mapa |
| `data/processed/quality-report.*`, `manifest.json` | Controles, cobertura y origen de cada año |

Los CSV crudos no se versionan (pesan unos 6 GB); sí el store compacto que se arma con ellos.

## Metodología en una página

1. Tasas por día calendario: volumen del mes dividido por sus días.
2. Arps hiperbólica `q(t) = qi / (1 + b·Di·t)^(1/b)` desde el pico, con `b ≤ 1`; se descarta con menos de 12 meses o R² menor que 0,30.
3. EUR = acumulada desde 2006 + cola con declinación terminal de 8 % anual, límite económico y 30 años como máximo. Banda por Monte Carlo sobre el ajuste.
4. Pozo tipo: percentiles por mes en producción de los pozos cuyo arranque se observa; mínimo 8 pozos.
5. Pronóstico: cada pozo activo sigue su curva (base) y cada campo suma pozos nuevos iguales a su pozo tipo, al ritmo del escenario.

El detalle completo, con limitaciones, está en la pestaña Metodología de la app (`src/components/Metodologia.tsx`).

## Desarrollo y validación

```bash
.venv/bin/python -m unittest pipeline.test_pipeline
npm test
npm run build
```

Los workflows corren estos controles en cada cambio, publican `dist/` en GitHub Pages al integrar en `main` y abren cada mes un pull request con los datos nuevos.

## Estructura

```text
pipeline/           descarga, cálculo y control de calidad (Python)
data/store/         insumos compactos versionados
data/processed/     reporte de calidad y manifiesto
public/data/        archivos que consume la web
src/                aplicación: pestañas, mapa SVG y modelo de pronóstico
src/didactica/      registro de módulos, panel «cómo se hizo» y páginas explicativas
scripts/            anclas al código y resumen de tokens de las sesiones
.github/workflows/  CI, Pages y actualización mensual
```
