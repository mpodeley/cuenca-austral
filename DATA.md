# Datos, atribución y limitaciones

## Procedencia

Los artefactos en modo `official` se derivan del catálogo de Datos Argentina y de publicaciones de la Secretaría de Energía. Cada ejecución registra URLs, fecha, tamaño y SHA-256 en `data/processed/manifest.json`.

El modo `demo` contiene datos sintéticos generados con semilla fija. Los nombres empiezan con “Área Escuela” y no representan concesiones, operadores, reservas ni producción reales.

## Reglas de transformación

- Se conservan registros asociados a la Cuenca Austral. Santa Cruz y Tierra del Fuego se usan como fallback solo cuando falta el nombre de cuenca.
- La convención publicada para Capítulo IV identifica `coordenadax` como latitud y `coordenaday` como longitud. El pipeline prueba ambos órdenes y acepta únicamente coordenadas dentro de los límites configurados.
- Los duplicados por pozo y mes se agregan antes de publicar.
- Gas se expresa en miles de m³ mensuales; petróleo y agua, en m³ mensuales.
- Los nulos no se transforman en ceros excepto en campos volumétricos aditivos.
- La vista web guarda los últimos 60 registros mensuales por pozo; métricas acumuladas y QA usan el histórico completo descargado.
- Los polígonos se cruzan por nombre normalizado de área. Cada bloque declara `geometrySource` como oficial o envolvente derivada.

## Advertencias

- Las fuentes son declaraciones juradas y pueden corregirse retroactivamente.
- La cobertura y actualización no son uniformes entre recursos.
- Los DataStore de producción 2014, 2015 y 2017 figuran activos en el catálogo pero devolvieron 404; el manifiesto registra esos descartes.
- Una concesión puede cambiar de operador o denominación.
- Las envolventes derivadas de pozos no representan límites legales.
- No hay trayectorias Austral publicadas en la fuente vigente localizada. La antigua publicación nacional no responde; la app no las inventa.
- Los pronósticos son escenarios técnicos didácticos, no reservas certificadas ni recomendaciones de inversión.
