# Datos, atribución y limitaciones

## Procedencia

Todo se deriva de publicaciones de la Secretaría de Energía de la Nación en `datos.energia.gob.ar`. `data/processed/manifest.json` registra, para cada año, el recurso usado, su URL, su fecha de modificación y cuántas filas de la Cuenca Austral aportó.

La producción se lee de los **CSV anuales completos**, por streaming. No se usa la API de consulta (DataStore) del portal: para 2014, 2015 y 2017 responde 404, y para 2024 y 2025 devolvía cargas parciales, aunque el archivo descargable de cada año está completo.

## Reglas de transformación

- Se conservan las filas con `cuenca = AUSTRAL`, convencionales y no convencionales.
- Cuando hay más de un recurso para un año se prefiere el que no es "DDJJ abiertas y cerradas"; entre gemelos, el más grande y luego el más reciente.
- La fuente trae una fila por pozo, mes y formación: los volúmenes se suman y los días efectivos no.
- Gas en miles de m³ por mes; petróleo y agua en m³ por mes. Las tasas publicadas son por día calendario.
- El bloque de cada pozo es el área de concesión que declara en su último mes informado.
- Los polígonos se cruzan por código de área y, si no coincide, por nombre normalizado. El shapefile oficial no trae superficie ni cuenca: la superficie se calcula y se toman las concesiones al sur de 48°S.
- Onshore u offshore se decide por si la ubicación de superficie del pozo cae sobre tierra firme (Natural Earth 1:10m).

## Controles

`pipeline/build_data.py` no publica si:

- falta algún mes entre enero de 2006 y el último mes;
- el total de la cuenca de un mes es menor que el 60 % de la mediana de sus doce meses vecinos;
- hay identificadores de pozo duplicados.

Un mes final se descarta si los pozos que todavía no declararon representaban más del 10 % de la producción. Si representan menos, esos pozos sostienen su última tasa en los totales hasta seis meses, y el reporte de calidad lista la operadora atrasada.

## Advertencias

- **La serie empieza en enero de 2006.** Los pozos que ya producían no tienen fecha de arranque ni acumulada anterior: su EUR y el agotamiento de los bloques antiguos están subestimados.
- **No hay trayectorias de pozo.** La única publicación oficial cubre Vaca Muerta. Los pozos se ubican por su coordenada de superficie.
- **14 de las 65 áreas no tienen polígono oficial.** Se dibujan como la envolvente de sus pozos, con borde punteado, y no tienen superficie. No representan límites legales.
- Las fuentes son declaraciones juradas y pueden corregirse retroactivamente.
- Una concesión puede cambiar de operadora o de denominación.
- EUR, pozos tipo y pronósticos son estimaciones didácticas, no reservas certificadas ni recomendaciones de inversión.
