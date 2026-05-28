# Web Push Android - VALIDO 1M OS

Las notificaciones con el movil bloqueado requieren HTTPS, Service Worker, permiso del navegador, PushManager y VAPID configurado en el backend.

## Activar

1. Abre la URL HTTPS de Render en Android Chrome.
2. Entra con `APP_ACCESS_KEY`.
3. Abre la pestaña `Guardian`.
4. Toca `Activar alertas con movil bloqueado`.
5. Acepta el permiso del navegador.
6. Toca `Probar Web Push`.

## Si No Llega

1. Chrome > Site settings > Notifications: permitir.
2. Android Settings > Apps > Chrome > Notifications: permitir.
3. Desactiva ahorro extremo de bateria para Chrome si bloquea background.
4. Si instalaste la PWA vieja, borra la app de la pantalla y limpia datos del sitio.
5. Vuelve a abrir la URL HTTPS e instala de nuevo.

## Samsung Internet

Samsung Internet puede soportar Service Workers, pero la entrega background depende de version, permisos y bateria. Si falla, usa Android Chrome para validar.

## iPhone

En iOS/iPadOS 16.4+:

1. Abre la URL en Safari.
2. Share > Add to Home Screen.
3. Abre la PWA instalada.
4. Activa notificaciones desde dentro de esa PWA.

Safari normal sin instalar puede no permitir Web Push persistente.

## Garantia Realista

No se puede prometer entrega 100%. Focus Mode, permisos, bateria, navegador, sistema operativo y hosting dormido pueden retrasar o bloquear pushes. La app muestra diagnostico de permiso, SW, subscription, ultimo error y ultima prueba.
