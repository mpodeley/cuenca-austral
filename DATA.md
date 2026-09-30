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

## Advertencias

- Las fuentes son declaraciones juradas y pueden corregirse retroactivamente.
- La cobertura y actualización no son uniformes entre recursos.
- Una concesión puede cambiar de operador o denominación.
- Las envolventes derivadas de pozos no representan límites legales.
- Los pronósticos son escenarios técnicos didácticos, no reservas certificadas ni recomendaciones de inversión.

