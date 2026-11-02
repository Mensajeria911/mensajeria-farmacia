# Portal independiente de farmacias

Aplicación web separada para el personal de las farmacias Farma Norte. Su responsabilidad es publicar servicios, consultar los pedidos de su sede y mantener la trazabilidad de lo que recibió la central.

## Ejecutar

Desde esta carpeta:

```bash
npm install
npm run dev
```

La aplicación usa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Durante el desarrollo dentro de este workspace, Vite lee el `.env.local` de la raíz mediante `envDir`; si el repositorio se mueve por separado, crea un `.env.local` en esta carpeta con las mismas variables.

## Acceso

La cuenta debe existir en Supabase Auth y tener un perfil con rol `pharmacy` y una `branch_id`. El trigger `on_auth_user_created` crea ese perfil si la cuenta se registra con metadatos `full_name`, `role` y `branch_code`.

## Responsabilidad del repositorio

Este repositorio no contiene la central ni la aplicación Android. Comparte el contrato de datos de Supabase, pero cada superficie tiene su propio despliegue y su propia sesión.
