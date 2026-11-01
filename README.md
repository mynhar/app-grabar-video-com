# Capas · grabador de pantalla y cámara

Versión básica de una app tipo Loom con la identidad visual de Harold M. Bonilla López.

## Cómo usarla

```bash
npm start
```

Abre http://localhost:5173 en Chrome o Edge (recomendado). No necesita instalar dependencias; solo Node.js 18 o superior.

## Qué incluye

- **Mis videos**: biblioteca con miniaturas, duración, búsqueda, orden y menú para renombrar, copiar enlace, descargar o eliminar.
- **Nueva grabación**: pantalla y cámara, solo pantalla o solo cámara; la pantalla completa viene seleccionada por defecto. Elección de cámara y micrófono con medidor de nivel; audio del sistema opcional.
- **Durante la grabación**: cuenta regresiva, pausar/reanudar, terminar y descartar.
- **Burbuja de cámara**: redonda, se puede mostrar u ocultar en cualquier momento, mover y cambiar de tamaño (botones − y +, o la rueda del ratón). En Chrome y Edge flota sobre las demás aplicaciones en una ventana Picture-in-Picture que se mueve desde su barra de título.
- **Reproductor**: título editable, velocidad de reproducción, contador de vistas y detalles del archivo.

## Límites de esta versión

- Los videos se guardan en el navegador (IndexedDB), no en un servidor. El enlace copiado solo funciona en el mismo navegador; para enviar un video a otra persona, descárgalo.
- La grabación de pantalla requiere un navegador de escritorio. Los controles flotantes con burbuja de cámara funcionan mejor en Chrome o Edge.
- La ventana flotante del navegador siempre es rectangular, así que la burbuja redonda se ve dentro de un cuadro, también en la grabación.
