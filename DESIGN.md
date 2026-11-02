# Portal de farmacias · sistema visual

## Dirección

Portal operativo de alta claridad para personal de farmacia: la interfaz debe ayudar a publicar un servicio en menos de un minuto y confirmar que la central lo recibió. La marca de operación es 911 Mensajeros Montería; la identidad de uso diario es Farma Norte.

## Tokens

- Azul de marca: `#0b2e76`.
- Azul de acción: `#0c67c7`.
- Cian de señal: `#1db8df`.
- Texto principal: `#172844`.
- Texto secundario: `#66748c`.
- Superficie: `#ffffff` sobre fondo frío `#f4f7fb`.
- Bordes: `#dce5ef` y `#cbd8e6`.
- Éxito: `#13815e` con fondo `#e4f5ed`.
- Error: `#b44750` con fondo `#fff0f0`.

## Composición

- Escritorio: navegación lateral estable, encabezado contextual y contenido de operación en una columna amplia.
- Publicación: formulario al lado izquierdo y una vista previa persistente a la derecha.
- Pedidos: tabla orientada a lectura rápida; en móvil se transforma en filas etiquetadas, no en una cuadrícula de tarjetas.
- Móvil: navegación lateral se repliega, el formulario pasa a una columna y la vista previa queda después de la acción principal.

## Reglas

- Los servicios visibles deben usar los nombres reales de la operación: domicilio en efectivo, compra, cruce, domicilio con compra, domicilio con cruce, domicilio compra y cruce y cambio de menuda.
- Las tarifas no confirmadas se muestran como `Por confirmar`; nunca se calculan sumando servicios.
- Los estados se comunican con texto e indicador, no únicamente con color.
- La sesión y los permisos provienen de Supabase Auth/RLS; la interfaz no inventa una cuenta local cuando está configurada la conexión real.
- Iconografía SVG de trazo fino, controles con objetivos táctiles cómodos y foco visible.
