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
- **Burbuja de cámara**: redonda por defecto. Se puede mostrar u ocultar en cualquier momento desde la propia burbuja, la barra de grabación o la ventana flotante, y se puede mover y cambiar de tamaño (botones − y +, o la rueda del ratón). En Chrome y Edge, al cambiar de pestaña pasa sola a una ventana flotante (Picture-in-Picture) que sigue visible sobre las demás pestañas y se cierra al volver a Capas. Para que flote también sobre otras aplicaciones, ábrela con el botón de controles flotantes de la barra de grabación.
- **Reproductor**: título editable, velocidad de reproducción, contador de vistas y detalles del archivo.

## Límites de esta versión

- Los videos se guardan en el navegador (IndexedDB), no en un servidor. El enlace copiado solo funciona en el mismo navegador; para enviar un video a otra persona, descárgalo.
- La grabación de pantalla requiere un navegador de escritorio. Los controles flotantes con burbuja de cámara funcionan mejor en Chrome o Edge.
- La ventana flotante del navegador siempre es rectangular: fuera de la pestaña de Capas, la burbuja redonda se ve dentro de un cuadro, también en la grabación. Dentro de la pestaña de Capas se ve redonda.
- La ventana flotante automática necesita Chrome o Edge 120 o posterior, con el picture-in-picture automático permitido para el sitio (viene activado). Solo se abre al cambiar de pestaña, no al pasar a otra aplicación.
