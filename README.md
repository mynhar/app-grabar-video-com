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
- **Burbuja de cámara**: redonda. Se puede mostrar u ocultar en cualquier momento, y se puede mover y cambiar de tamaño (botones − y +, o la rueda del ratón). Con la extensión de Capas instalada, la burbuja y sus controles se ven en cualquier pestaña. Sin la extensión, la burbuja solo se ve en la pestaña de Capas; al cambiar de pestaña pasa a una ventana flotante rectangular (Picture-in-Picture).
- **Reproductor**: título editable, velocidad de reproducción, contador de vistas y detalles del archivo.

## Extensión: la burbuja en todas las pestañas

La carpeta `extension/` es una extensión de Chrome que muestra la burbuja redonda de la cámara sobre la pestaña que estés viendo mientras grabas la pantalla. Debajo de la burbuja hay una barra con el tiempo y los botones para pausar, terminar y mostrar u ocultar la cámara.

Para instalarla:

1. Abre `chrome://extensions` en Chrome.
2. Activa el **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** (*Load unpacked*) y elige la carpeta `extension` de este proyecto.
4. Se abre una pestaña para dar permiso de cámara. Pulsa **Permitir cámara** y, en el aviso de Chrome, elige la opción que lo permite siempre.

No hace falta recargar Capas ni las demás pestañas. Cuando la extensión está instalada, Capas lo detecta solo y usa su burbuja en lugar de la ventana flotante.

Durante la grabación:

- **Mostrar u ocultar la cámara**: con el botón de cámara de la barra, desde la burbuja o pulsando el icono de Capas en la barra de herramientas de Chrome. Con la cámara oculta, la barra sigue visible.
- **Mover**: arrastra la burbuja o la barra.
- **Cambiar de tamaño**: usa los botones − y + (aparecen al pasar el ratón por la burbuja) o la rueda del ratón.

La posición y el tamaño se guardan para las siguientes grabaciones.

## Límites de esta versión

- Los videos se guardan en el navegador (IndexedDB), no en un servidor. El enlace copiado solo funciona en el mismo navegador; para enviar un video a otra persona, descárgalo.
- La grabación de pantalla requiere un navegador de escritorio. Los controles flotantes con burbuja de cámara funcionan mejor en Chrome o Edge.
- Con la extensión, la burbuja se ve dentro de las páginas web de Chrome, pero no sobre otras aplicaciones ni en las páginas internas de Chrome (`chrome://`, nueva pestaña, Chrome Web Store).
- Algunas páginas no permiten usar la cámara dentro de ellas (por ejemplo, WhatsApp Web). Ahí la burbuja muestra un aviso en lugar de la cámara.
- Al cambiar de pestaña, la cámara de la burbuja tarda un instante en aparecer, porque se vuelve a abrir en cada pestaña.
- Sin la extensión, la ventana flotante del navegador siempre es rectangular: fuera de la pestaña de Capas, la burbuja se ve dentro de un cuadro, también en la grabación. Esa ventana se abre sola al cambiar de pestaña con Chrome o Edge 120 o posterior, si el picture-in-picture automático está permitido para el sitio (viene activado), pero no al pasar a otra aplicación.
