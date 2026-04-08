# NapolitanoBA — Tienda Online

## Stack
- **Backend:** Node.js + Express
- **Base de datos:** SQLite (sql.js)
- **Pagos:** MercadoPago API
- **Deploy:** Docker / Easypanel

## Setup rápido

### Local (desarrollo)
```bash
npm install
node server.js
```
Abrir http://localhost:3000

### Con Docker
```bash
docker-compose up -d
```

### En Easypanel
1. Crear un nuevo servicio "App" en Easypanel
2. Conectar el repo de GitHub o subir el código
3. Configurar las variables de entorno:
   - `PORT`: 3000
   - `ADMIN_PASSWORD`: (tu contraseña)
   - `MP_ACCESS_TOKEN`: (token de MercadoPago)
   - `SITE_URL`: https://tu-dominio.com
   - `WA_NUMBER`: 5491134240505
4. Montar volúmenes para persistencia:
   - `/app/data` → para la base de datos
   - `/app/public/uploads` → para las imágenes

## Rutas
- `/` → Tienda
- `/admin` → Panel de administración (contraseña: admin123)
- `/api/products` → API de productos
- `/api/crear-pago` → Crear preferencia de MercadoPago

## Panel Admin
Acceder a `/admin` con la contraseña configurada.
Desde ahí se puede:
- Agregar productos con foto, precio, categoría, talle, badge
- Editar productos existentes
- Activar/desactivar productos (sin eliminar)
- Ver pedidos recientes

## MercadoPago
Para activar pagos reales:
1. Crear app en https://www.mercadopago.com.ar/developers/panel/app
2. Obtener el Access Token de PRODUCCIÓN
3. Configurar `MP_ACCESS_TOKEN` con ese token
4. Configurar `SITE_URL` con el dominio real
5. En el panel de MP, configurar el webhook URL: `https://tu-dominio.com/api/webhook-mp`

## Imágenes de productos
Las fotos se suben desde el admin y se guardan en `/public/uploads/`.
Asegurarse de montar este directorio como volumen para persistencia.
