const express = require('express');
const path = require('path');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const initSQL = require('sql.js');
const fs = require('fs');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ───
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000';
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const WA_NUMBER = process.env.WA_NUMBER || '5491134240505';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://nuevo-proyecto-rvl-n8n.gatibv.easypanel.host/webhook/napolitano-venta';

// MercadoPago
const mpClient = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
const preference = new Preference(mpClient);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `product_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── DATABASE ───
let db;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function initDB() {
  const SQL = await initSQL();
  
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL,
    category TEXT DEFAULT 'Accesorios',
    size TEXT DEFAULT 'Único',
    image TEXT,
    badge TEXT,
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    products_json TEXT,
    total INTEGER,
    customer_name TEXT,
    customer_email TEXT,
    customer_dni TEXT,
    customer_phone TEXT,
    shipping_address TEXT,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending',
    mp_preference_id TEXT,
    mp_payment_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed products if empty
  const count = db.exec("SELECT COUNT(*) FROM products")[0]?.values[0][0] || 0;
  if (count === 0) {
    const stmt = db.prepare("INSERT INTO products (name, description, price, category, badge, image, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const seed = [
      ["Bandolera Prada Style", "Bandolera compacta con diseño inspirado en alta costura. Correa ajustable y cierre magnético. Ideal para el día a día.", 45000, "Accesorios", "Nuevo", "/uploads/bandolera_prada.jpg"],
      ["Bandolera Urbana Texturizada", "Diseño exclusivo con textura premium. Compartimiento principal amplio con bolsillo interno. Estilo único para destacar.", 38000, "Accesorios", "", "/uploads/bandolera_rara.jpg"],
      ["Bandolera Tommy Style", "Estilo clásico deportivo con detalles premium. Tamaño ideal para llevar lo esencial. Correa regulable con logo.", 35000, "Accesorios", "Popular", "/uploads/bandolera_tomy.jpg"],
      ["Cartera Rosa Elegante", "Cartera femenina en tono rosa pastel. Interior forrado con múltiples compartimentos. Cierre premium con herrajes dorados.", 42000, "Accesorios", "", "/uploads/cartera_rosa.jpg"],
      ["Cartera Verde Militar", "Verde militar tendencia. Material resistente con acabado mate. Diseño moderno y funcional con bolsillos internos.", 42000, "Accesorios", "Nuevo", "/uploads/cartera_verde.jpg"],
      ["Combo LV Style Premium", "Set completo de accesorios con monograma. Incluye bandolera + billetera a juego. La dupla perfecta para regalar o usar.", 65000, "Accesorios", "Combo", "/uploads/combo_luisvi.jpg"],
      ["Gorra GG Style Marrón", "Gorra con diseño clásico en tonos tierra. Ajuste trasero regulable. Visera curva con bordado frontal detallado.", 25000, "Accesorios", "", "/uploads/gorra_gucci_marron.jpg"],
      ["Gorra GG Style Negra", "Total black con detalles sutiles. Algodón premium con interior forrado. El accesorio infaltable para cualquier outfit.", 25000, "Accesorios", "Popular", "/uploads/gorra_gucci_negra.jpg"],
      ["Mochila Urban White", "Mochila en cuero sintético blanco premium. Compartimiento para notebook, bolsillos laterales y cierre YKK. Elegancia urbana.", 55000, "Accesorios", "Nuevo", "/uploads/mochila_blanca.jpg"],
      ["Mochila Urban Black", "La versión negra de nuestra mochila insignia. Material waterproof, costuras reforzadas. Perfecta para el día a día con estilo.", 55000, "Accesorios", "", "/uploads/mochila_negra.jpg"],
    ];
    seed.forEach((p, i) => { stmt.run([...p, i]); });
    stmt.free();
    saveDB();
  }
}

function saveDB() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Error saving DB:', err.message);
  }
}

function getLastInsertId() {
  const result = db.exec("SELECT last_insert_rowid()");
  return result[0]?.values[0][0] || 0;
}

function getProducts(activeOnly = true) {
  const where = activeOnly ? "WHERE active = 1" : "";
  const results = db.exec(`SELECT * FROM products ${where} ORDER BY sort_order ASC, id ASC`);
  if (!results.length) return [];
  const columns = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

// ─── AUTH MIDDLEWARE ───
function requireAdmin(req, res, next) {
  if (req.cookies?.admin_token === ADMIN_PASSWORD) return next();
  res.redirect('/admin/login');
}

// ─── ROUTES: STORE ───
app.get('/', (req, res) => {
  const products = getProducts(true);
  const categories = [...new Set(products.map(p => p.category))];
  res.send(renderStore(products, categories));
});

// ─── ROUTES: ADMIN ───
app.get('/admin/login', (req, res) => {
  res.send(renderAdminLogin());
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.cookie('admin_token', ADMIN_PASSWORD, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    return res.redirect('/admin');
  }
  res.send(renderAdminLogin('Contraseña incorrecta'));
});

app.get('/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.redirect('/admin/login');
});

app.get('/admin', requireAdmin, (req, res) => {
  const products = getProducts(false);
  const orders = getOrders();
  res.send(renderAdmin(products, orders));
});

// ─── API: PRODUCTS ───
app.post('/api/products', requireAdmin, upload.single('image'), (req, res) => {
  const { name, description, price, category, badge, size } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const maxOrder = db.exec("SELECT MAX(sort_order) FROM products")[0]?.values[0][0] || 0;
  
  db.run("INSERT INTO products (name, description, price, category, badge, size, image, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [name, description || '', parseInt(price), category || 'Accesorios', badge || '', size || 'Único', image, maxOrder + 1]);
  saveDB();
  res.json({ ok: true });
});

app.put('/api/products/:id', requireAdmin, upload.single('image'), (req, res) => {
  const { name, description, price, category, badge, size, active } = req.body;
  const id = req.params.id;
  
  if (req.file) {
    db.run("UPDATE products SET name=?, description=?, price=?, category=?, badge=?, size=?, image=?, active=? WHERE id=?",
      [name, description || '', parseInt(price), category || 'Accesorios', badge || '', size || 'Único', `/uploads/${req.file.filename}`, active !== undefined ? parseInt(active) : 1, id]);
  } else {
    db.run("UPDATE products SET name=?, description=?, price=?, category=?, badge=?, size=?, active=? WHERE id=?",
      [name, description || '', parseInt(price), category || 'Accesorios', badge || '', size || 'Único', active !== undefined ? parseInt(active) : 1, id]);
  }
  saveDB();
  res.json({ ok: true });
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  db.run("DELETE FROM products WHERE id=?", [req.params.id]);
  saveDB();
  res.json({ ok: true });
});

app.put('/api/products/:id/toggle', requireAdmin, (req, res) => {
  db.run("UPDATE products SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=?", [req.params.id]);
  saveDB();
  const result = db.exec(`SELECT active FROM products WHERE id=${req.params.id}`);
  res.json({ ok: true, active: result[0]?.values[0][0] });
});

// ─── API: CASH ORDERS ───
app.post('/api/orden-efectivo', (req, res) => {
  try {
    const { items, customer } = req.body;
    const total = items.reduce((s, i) => s + i.price, 0);
    db.run(`INSERT INTO orders (products_json, total, customer_name, customer_email, customer_dni, customer_phone, shipping_address, payment_method, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'efectivo', 'pending')`,
      [JSON.stringify(items), total, customer.nombre + ' ' + customer.apellido, customer.email, customer.dni, customer.phone || '',
       JSON.stringify({ calle: customer.calle, localidad: customer.localidad, provincia: customer.provincia, cp: customer.cp, edificio: customer.edificio })]);
    saveDB();
    res.json({ ok: true });
  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ ok: false });
  }
});

// ─── API: MERCADOPAGO ───
app.post('/api/crear-pago', async (req, res) => {
  try {
    const { items, customer } = req.body;
    
    const mpItems = items.map(item => ({
      title: item.name,
      quantity: 1,
      unit_price: item.price,
      currency_id: 'ARS',
    }));

    const total = items.reduce((s, i) => s + i.price, 0);

    // Save order
    db.run(`INSERT INTO orders (products_json, total, customer_name, customer_email, customer_dni, customer_phone, shipping_address, payment_method, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'mercadopago', 'pending')`,
      [JSON.stringify(items), total, customer.nombre + ' ' + customer.apellido, customer.email, customer.dni, customer.phone || '',
       JSON.stringify({ calle: customer.calle, localidad: customer.localidad, provincia: customer.provincia, cp: customer.cp, edificio: customer.edificio })]);
    
    const orderId = getLastInsertId();
    console.log('New order created with ID:', orderId);
    saveDB();

    const prefData = await preference.create({
      body: {
        items: mpItems,
        payer: {
          name: customer.nombre,
          surname: customer.apellido,
          email: customer.email,
        },
        back_urls: {
          success: `${SITE_URL}/pago-exitoso?order=${orderId}`,
          failure: `${SITE_URL}/pago-fallido?order=${orderId}`,
          pending: `${SITE_URL}/pago-pendiente?order=${orderId}`,
        },
        auto_return: 'approved',
        external_reference: String(orderId),
        notification_url: `${SITE_URL}/api/webhook-mp`,
      }
    });

    db.run("UPDATE orders SET mp_preference_id=? WHERE id=?", [prefData.id, orderId]);
    saveDB();

    res.json({ ok: true, init_point: prefData.init_point, sandbox_init_point: prefData.sandbox_init_point });
  } catch (err) {
    console.error('MP Error:', err);
    res.status(500).json({ ok: false, error: 'Error al crear el pago' });
  }
});

// Webhook MP
app.post('/api/webhook-mp', async (req, res) => {
  try {
    console.log('=== WEBHOOK MP RECEIVED ===');
    console.log('Body:', JSON.stringify(req.body));
    console.log('Query:', JSON.stringify(req.query));
    
    let paymentId = null;
    
    if (req.body?.data?.id) {
      paymentId = req.body.data.id;
    } else if (req.query?.id && (req.query?.topic === 'payment' || req.query?.type === 'payment')) {
      paymentId = req.query.id;
    } else if (req.body?.resource) {
      const match = req.body.resource.match(/payments\/(\d+)/);
      if (match) paymentId = match[1];
    } else if (req.query?.['data.id']) {
      paymentId = req.query['data.id'];
    }
    
    console.log('Payment ID extracted:', paymentId);
    
    if (paymentId) {
      console.log('Fetching payment from MP...');
      const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
      });
      const payment = await paymentRes.json();
      console.log('Payment status:', payment.status, 'External ref:', payment.external_reference);
      
      if (payment.status === 'approved') {
        const orderId = payment.external_reference;
        
        if (orderId) {
          db.run("UPDATE orders SET payment_status='approved', mp_payment_id=? WHERE id=?", [String(paymentId), orderId]);
          saveDB();
          console.log('Order updated:', orderId);
        }
        
        const n8nData = {
          evento: 'pago_confirmado',
          pedido_id: orderId || 'sin_referencia',
          total: payment.transaction_amount,
          metodo_pago: 'MercadoPago',
          mp_payment_id: String(paymentId),
          payer_email: payment.payer?.email || '',
          fecha: new Date().toISOString()
        };
        
        if (orderId) {
          try {
            const orderResult = db.exec(`SELECT * FROM orders WHERE id=${orderId}`);
            if (orderResult.length > 0) {
              const columns = orderResult[0].columns;
              const row = orderResult[0].values[0];
              const order = {};
              columns.forEach((col, i) => order[col] = row[i]);
              n8nData.cliente = order.customer_name;
              n8nData.email = order.customer_email;
              n8nData.telefono = order.customer_phone;
              n8nData.dni = order.customer_dni;
              n8nData.productos = JSON.parse(order.products_json || '[]');
              n8nData.direccion = JSON.parse(order.shipping_address || '{}');
            }
          } catch (dbErr) {
            console.error('DB error:', dbErr.message);
          }
        }
        
        console.log('Sending to n8n:', N8N_WEBHOOK_URL);
        try {
          const n8nRes = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(n8nData)
          });
          console.log('n8n response:', n8nRes.status);
          console.log('=== N8N NOTIFIED OK ===');
        } catch (n8nErr) {
          console.error('n8n failed:', n8nErr.message);
        }
      } else {
        console.log('Payment not approved, status:', payment.status);
      }
    } else {
      console.log('No payment ID found in webhook');
    }
    
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(500);
  }
});

// Also handle GET for MP webhook verification
app.get('/api/webhook-mp', (req, res) => {
  console.log('=== WEBHOOK MP GET ===', JSON.stringify(req.query));
  res.sendStatus(200);
});

// Payment result pages
app.get('/pago-exitoso', (req, res) => {
  const orderId = req.query.order;
  let orderData = null;
  if (orderId) {
    try {
      const result = db.exec(`SELECT * FROM orders WHERE id=${orderId}`);
      if (result.length > 0) {
        const columns = result[0].columns;
        const row = result[0].values[0];
        orderData = {};
        columns.forEach((col, i) => orderData[col] = row[i]);
      }
    } catch(e) {}
  }
  res.send(renderPaymentSuccess(orderId, orderData));
});
app.get('/pago-fallido', (req, res) => { res.send(renderPaymentResult('failure', req.query.order)); });
app.get('/pago-pendiente', (req, res) => { res.send(renderPaymentResult('pending', req.query.order)); });

// ─── API: ORDERS (for admin) ───
function getOrders() {
  const results = db.exec("SELECT * FROM orders WHERE payment_method='mercadopago' ORDER BY id DESC");
  if (!results.length) return [];
  const columns = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

// ─── RENDER FUNCTIONS ───
function renderStore(products, categories) {
  const allCats = ['Todos', 'Remeras', 'Bermudas', 'Buzos', 'Pantalones', 'Conjuntos', 'Zapatillas', 'Accesorios', 'Perfumes'];
  
  const productCards = products.map(p => {
    const img = p.image || '/public/placeholder.png';
    const badge = p.badge ? `<div class="product-badge">${p.badge}</div>` : '';
    const shortDesc = (p.description || '').split('.')[0] + '.';
    const priceF = '$' + p.price.toLocaleString('es-AR');
    return `<div class="product-card reveal" data-name="${p.name}" data-desc="${p.description || ''}" data-price="${p.price}" data-cat="${p.category}" data-img="${img}" data-size="${p.size || 'Único'}" onclick="openProduct(this)">
      <div class="product-img-wrap"><img src="${img}" alt="${p.name}" loading="lazy">${badge}</div>
      <div class="product-info"><div class="product-name">${p.name}</div><div class="product-desc-short">${shortDesc}</div><div class="product-price">${priceF}</div></div></div>`;
  }).join('');

  const catBtns = allCats.map(c => `<button class="cat-btn${c === 'Todos' ? ' active' : ''}" onclick="filterCat('${c}',this)">${c}</button>`).join('');

  return getStoreHTML(productCards, catBtns);
}

function getStoreHTML(productCards, catBtns) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NapolitanoBA — Buenos Aires</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--white:#fff;--off-white:#f5f5f5;--light-gray:#e8e8e8;--mid-gray:#888;--dark:#111;--black:#000;--green:#25D366;--red:#e53935;--mp-blue:#009ee3}
html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased}
body{font-family:'Outfit',sans-serif;background:var(--white);color:var(--dark);overflow-x:hidden}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:var(--white)}::-webkit-scrollbar-thumb{background:var(--dark);border-radius:3px}
a{text-decoration:none;color:inherit}button{cursor:pointer}
.navbar{position:fixed;top:0;left:0;right:0;z-index:1000;background:rgba(255,255,255,0.96);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-bottom:1px solid rgba(0,0,0,0.06);transition:box-shadow 0.3s}
.navbar.scrolled{box-shadow:0 2px 40px rgba(0,0,0,0.06)}
.nav-inner{max-width:1440px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:10px 48px;gap:20px}
.nav-left{display:flex;align-items:center;gap:12px;cursor:pointer;flex-shrink:0}.nav-left span{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:4px}
.nav-center{display:flex;gap:28px;align-items:center}
.nav-center a{font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;position:relative;cursor:pointer;padding:4px 0}
.nav-center a::after{content:'';position:absolute;bottom:-2px;left:0;width:0;height:1.5px;background:var(--dark);transition:width 0.35s cubic-bezier(0.16,1,0.3,1)}.nav-center a:hover::after{width:100%}
.nav-right{display:flex;align-items:center;gap:12px;flex-shrink:0}
.nav-search{display:flex;align-items:center;gap:8px;background:var(--off-white);border-radius:100px;padding:7px 14px;width:180px;transition:width 0.3s}.nav-search:focus-within{width:220px}
.nav-search input{border:none;outline:none;background:transparent;font-family:'Outfit',sans-serif;font-size:11px;width:100%}.nav-search svg{width:14px;height:14px;flex-shrink:0;opacity:0.5}
.cart-btn{position:relative;padding:6px;background:none;border:none}.cart-btn svg{width:22px;height:22px}
.cart-badge{position:absolute;top:0;right:0;width:16px;height:16px;border-radius:50%;background:var(--dark);color:var(--white);font-size:9px;font-weight:700;display:none;align-items:center;justify-content:center}.cart-badge.show{display:flex}
.hamburger{display:none;flex-direction:column;gap:5px;padding:8px;background:none;border:none;z-index:1001}
.hamburger span{display:block;width:22px;height:1.5px;background:var(--dark);transition:all 0.3s}
.hamburger.active span:nth-child(1){transform:rotate(45deg) translate(4px,4px)}.hamburger.active span:nth-child(2){opacity:0}.hamburger.active span:nth-child(3){transform:rotate(-45deg) translate(5px,-5px)}
.mobile-menu{display:none;position:fixed;inset:0;background:var(--white);z-index:999;flex-direction:column;justify-content:center;align-items:center;gap:32px;opacity:0;pointer-events:none;transition:opacity 0.3s}
.mobile-menu.open{display:flex;opacity:1;pointer-events:all}.mobile-menu a{font-family:'Bebas Neue',sans-serif;font-size:44px;letter-spacing:4px;cursor:pointer}.mobile-menu a:hover{opacity:0.4}
.hero{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--dark);position:relative;overflow:hidden;padding:100px 40px 80px}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 20% 50%,rgba(30,30,30,0.8) 0%,transparent 60%),radial-gradient(ellipse at 80% 80%,rgba(20,20,20,0.6) 0%,transparent 50%)}
.hero-content{position:relative;z-index:2;text-align:center;max-width:1000px}
.hero-brand{font-family:'Bebas Neue',sans-serif;font-size:clamp(72px,12vw,160px);color:var(--white);letter-spacing:clamp(8px,2vw,20px);line-height:0.9;margin-bottom:24px;animation:fadeUp 1s cubic-bezier(0.16,1,0.3,1) both}
.hero-tagline{color:rgba(255,255,255,0.45);font-size:clamp(11px,1.4vw,15px);letter-spacing:6px;text-transform:uppercase;font-weight:300;animation:fadeUp 1s cubic-bezier(0.16,1,0.3,1) 0.2s both}
.hero-cta{margin-top:48px;animation:fadeUp 1s cubic-bezier(0.16,1,0.3,1) 0.4s both}
.hero-cta span{display:inline-block;padding:15px 52px;border:1px solid rgba(255,255,255,0.25);color:var(--white);font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:500;cursor:pointer;transition:all 0.4s}
.hero-cta span:hover{background:var(--white);color:var(--dark)}
.hero-scroll{position:absolute;bottom:32px;left:50%;transform:translateX(-50%);animation:fadeUp 1s cubic-bezier(0.16,1,0.3,1) 0.6s both}
.hero-scroll svg{width:20px;height:20px;stroke:rgba(255,255,255,0.3);animation:bounce 2s ease-in-out infinite}
@keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}
.marquee-bar{background:var(--dark);color:var(--white);padding:11px 0;overflow:hidden;white-space:nowrap}
.marquee-track{display:inline-flex;animation:marquee 35s linear infinite}
.marquee-track span{font-size:10px;letter-spacing:4px;text-transform:uppercase;font-weight:400;padding:0 36px;opacity:0.6}
@keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.section{padding:80px 40px}.section-header{text-align:center;margin-bottom:32px}
.section-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(44px,5vw,72px);letter-spacing:3px;line-height:1}
.categories{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;max-width:900px;margin:0 auto 40px}
.cat-btn{padding:8px 20px;border:1.5px solid var(--light-gray);background:transparent;font-family:'Outfit',sans-serif;font-size:11px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:var(--mid-gray);transition:all 0.3s}
.cat-btn:hover,.cat-btn.active{background:var(--dark);color:var(--white);border-color:var(--dark)}
.products-search{max-width:400px;margin:0 auto 32px;display:flex;align-items:center;gap:10px;border:1px solid var(--light-gray);padding:10px 18px;transition:border-color 0.3s}
.products-search:focus-within{border-color:var(--dark)}.products-search input{border:none;outline:none;background:transparent;font-family:'Outfit',sans-serif;font-size:13px;width:100%}.products-search svg{width:16px;height:16px;flex-shrink:0;opacity:0.4}
.no-results{text-align:center;padding:60px 20px;color:var(--mid-gray);font-size:14px;display:none}
.products-grid{max-width:1320px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.product-card{background:var(--off-white);overflow:hidden;transition:all 0.5s cubic-bezier(0.16,1,0.3,1);cursor:pointer}.product-card.hidden{display:none}
.product-card:hover{transform:translateY(-3px);box-shadow:0 20px 50px rgba(0,0,0,0.07)}
.product-img-wrap{position:relative;overflow:hidden;aspect-ratio:3/4;background:var(--light-gray)}
.product-img-wrap img{width:100%;height:100%;object-fit:cover;transition:transform 0.7s cubic-bezier(0.16,1,0.3,1)}
.product-card:hover .product-img-wrap img{transform:scale(1.05)}
.product-badge{position:absolute;top:12px;left:12px;background:var(--dark);color:var(--white);font-size:9px;letter-spacing:2px;text-transform:uppercase;padding:4px 10px;font-weight:500;z-index:2}
.product-info{padding:16px 16px 20px}.product-name{font-size:13px;font-weight:600;letter-spacing:0.3px;margin-bottom:4px}
.product-desc-short{font-size:11px;color:var(--mid-gray);line-height:1.5;margin-bottom:6px;font-weight:300}
.product-price{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:1px}
.modal-overlay{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s}
.modal-overlay.open{display:flex;opacity:1}
.modal{background:var(--white);width:min(960px,94vw);max-height:92vh;overflow-y:auto;position:relative;display:grid;grid-template-columns:1fr 1fr;animation:modalIn 0.4s cubic-bezier(0.16,1,0.3,1)}
@keyframes modalIn{from{opacity:0;transform:translateY(16px) scale(0.98)}to{opacity:1;transform:none}}
.modal-close{position:absolute;top:14px;right:14px;z-index:10;width:34px;height:34px;border-radius:50%;border:none;background:var(--off-white);display:flex;align-items:center;justify-content:center;transition:background 0.2s}
.modal-close:hover{background:var(--light-gray)}.modal-close svg{width:16px;height:16px}
.modal-img{aspect-ratio:3/4;overflow:hidden;background:var(--off-white)}.modal-img img{width:100%;height:100%;object-fit:cover}
.modal-details{padding:36px 32px;display:flex;flex-direction:column;justify-content:center}
.modal-category{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--green);font-weight:600;margin-bottom:6px}
.modal-name{font-family:'Bebas Neue',sans-serif;font-size:34px;letter-spacing:2px;margin-bottom:6px;line-height:1.1}
.modal-desc{font-size:12px;color:var(--mid-gray);line-height:1.7;margin-bottom:18px;font-weight:300}
.modal-price-row{display:flex;align-items:baseline;gap:12px;margin-bottom:20px}
.modal-price{font-family:'Bebas Neue',sans-serif;font-size:30px;letter-spacing:1px}
.modal-cuotas{font-size:11px;color:var(--mid-gray);font-weight:300}
.modal-size{margin-bottom:20px}.modal-size label{display:block;font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px}
.size-option{display:inline-flex;align-items:center;justify-content:center;min-width:80px;padding:9px 18px;border:1.5px solid var(--dark);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:var(--dark);color:var(--white)}
.modal-actions{display:flex;flex-direction:column;gap:8px}
.btn-cart{width:100%;padding:14px;border:none;background:var(--dark);color:var(--white);font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;transition:background 0.3s}.btn-cart:hover{background:#333}
.btn-wa{width:100%;padding:12px;border:1.5px solid var(--dark);background:transparent;color:var(--dark);font-family:'Outfit',sans-serif;font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;transition:all 0.3s;display:flex;align-items:center;justify-content:center;gap:8px}
.btn-wa:hover{background:var(--green);color:var(--white);border-color:var(--green)}.btn-wa svg{width:16px;height:16px}
.modal-info-row{display:flex;align-items:center;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--light-gray);font-size:10px;color:var(--mid-gray);font-weight:300}
.modal-info-row svg{width:14px;height:14px;flex-shrink:0;opacity:0.5}
.cart-overlay{position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.4);display:none;opacity:0;transition:opacity 0.3s}.cart-overlay.open{display:block;opacity:1}
.cart-drawer{position:fixed;top:0;right:-420px;bottom:0;z-index:3001;width:min(400px,92vw);background:var(--white);box-shadow:-10px 0 40px rgba(0,0,0,0.1);transition:right 0.4s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column}.cart-drawer.open{right:0}
.cart-header{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--light-gray)}
.cart-header h3{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px}.cart-close{background:none;border:none;padding:4px}.cart-close svg{width:20px;height:20px}
.cart-items{flex:1;overflow-y:auto;padding:14px 22px}.cart-empty{text-align:center;padding:60px 20px;color:var(--mid-gray);font-size:13px;font-weight:300}
.cart-item{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--light-gray)}
.cart-item-img{width:65px;height:85px;flex-shrink:0;overflow:hidden;background:var(--off-white)}.cart-item-img img{width:100%;height:100%;object-fit:cover}
.cart-item-info{flex:1;display:flex;flex-direction:column;justify-content:center;gap:3px}
.cart-item-name{font-size:12px;font-weight:600}.cart-item-size{font-size:9px;color:var(--mid-gray);letter-spacing:1px;text-transform:uppercase}.cart-item-price{font-family:'Bebas Neue',sans-serif;font-size:17px}
.cart-item-remove{align-self:center;background:none;border:none;padding:6px;opacity:0.4;transition:opacity 0.2s}.cart-item-remove:hover{opacity:1}.cart-item-remove svg{width:14px;height:14px}
.cart-footer{padding:18px 22px;border-top:1px solid var(--light-gray)}
.cart-total{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px}
.cart-total span:first-child{font-size:12px;font-weight:500;letter-spacing:1px;text-transform:uppercase}.cart-total span:last-child{font-family:'Bebas Neue',sans-serif;font-size:26px}
.cart-checkout{width:100%;padding:14px;border:none;background:var(--dark);color:var(--white);font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;transition:background 0.3s}.cart-checkout:hover{background:#333}
.checkout-overlay{position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s}.checkout-overlay.open{display:flex;opacity:1}
.checkout-modal{background:var(--white);width:min(560px,94vw);max-height:92vh;overflow-y:auto;animation:modalIn 0.4s cubic-bezier(0.16,1,0.3,1)}
.checkout-header{display:flex;align-items:center;justify-content:space-between;padding:20px 28px;border-bottom:1px solid var(--light-gray)}
.checkout-header h3{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:2px}
.checkout-body{padding:24px 28px}.checkout-section{margin-bottom:24px}
.checkout-section h4{font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--light-gray)}
.form-row{display:flex;gap:12px;margin-bottom:12px}.form-group{flex:1;display:flex;flex-direction:column;gap:4px}
.form-group label{font-size:10px;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--mid-gray)}
.form-group input{padding:10px 14px;border:1.5px solid var(--light-gray);font-family:'Outfit',sans-serif;font-size:13px;outline:none;transition:border-color 0.2s;background:var(--white)}
.form-group input:focus{border-color:var(--dark)}.form-group input.error{border-color:var(--red)}
.form-group .error-msg{font-size:10px;color:var(--red);display:none}.form-group input.error~.error-msg{display:block}
.checkout-summary{background:var(--off-white);padding:16px 18px;margin-bottom:20px}
.checkout-summary-item{display:flex;justify-content:space-between;font-size:12px;padding:4px 0}
.checkout-summary-item.total{font-weight:700;font-size:14px;border-top:1px solid var(--light-gray);padding-top:10px;margin-top:8px}
.payment-options{display:flex;gap:10px;margin-bottom:16px}
.payment-opt{flex:1;padding:14px;border:1.5px solid var(--light-gray);text-align:center;cursor:pointer;transition:all 0.3s}
.payment-opt:hover,.payment-opt.active{border-color:var(--dark);background:var(--dark);color:var(--white)}
.payment-opt .po-title{font-size:12px;font-weight:600;letter-spacing:1px;margin-bottom:2px}.payment-opt .po-sub{font-size:10px;opacity:0.6;font-weight:300}
.checkout-submit{width:100%;padding:16px;border:none;background:var(--dark);color:var(--white);font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;transition:background 0.3s;margin-top:8px}
.checkout-submit:hover{background:#333}.checkout-submit.mp{background:var(--mp-blue)}.checkout-submit.mp:hover{background:#0085c2}
.info-section{background:var(--off-white)}.info-grid{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:28px}
.info-card{text-align:center;padding:40px 24px}.info-icon{width:50px;height:50px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--dark);border-radius:50%}.info-icon svg{width:20px;height:20px}
.info-card h3{font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px}.info-card p{font-size:12px;color:var(--mid-gray);line-height:1.7;font-weight:300}
footer{background:var(--black);color:var(--white);padding:48px 40px 32px;text-align:center}
.footer-inner{max-width:600px;margin:0 auto}.footer-brand{font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:6px;margin-bottom:28px}
.footer-links{display:flex;justify-content:center;gap:24px;margin-bottom:28px}
.footer-link{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:400;letter-spacing:1px;color:rgba(255,255,255,0.6);transition:color 0.3s}.footer-link:hover{color:var(--white)}.footer-link svg{width:18px;height:18px;fill:currentColor}
.footer-divider{width:60px;height:1px;background:rgba(255,255,255,0.12);margin:0 auto 20px}
.footer-copy{font-size:10px;color:rgba(255,255,255,0.25);letter-spacing:2px;font-weight:300}
.floating-btns{position:fixed;bottom:24px;right:24px;z-index:900;display:flex;flex-direction:column;gap:12px}
.float-btn{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.15);transition:all 0.3s cubic-bezier(0.16,1,0.3,1);border:none;animation:floatIn 0.6s cubic-bezier(0.16,1,0.3,1) both}
.float-btn:nth-child(2){animation-delay:0.1s}.float-btn:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(0,0,0,0.2)}
.float-btn.wa{background:var(--green)}.float-btn.ig{background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)}
.float-btn svg{width:24px;height:24px;fill:white}
@keyframes floatIn{from{opacity:0;transform:scale(0.5) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
.reveal{opacity:0;transform:translateY(36px);transition:all 0.7s cubic-bezier(0.16,1,0.3,1)}.reveal.visible{opacity:1;transform:translateY(0)}
.toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%) translateY(20px);z-index:5000;background:var(--dark);color:var(--white);padding:14px 28px;font-size:12px;letter-spacing:1px;opacity:0;transition:all 0.4s cubic-bezier(0.16,1,0.3,1);pointer-events:none;white-space:nowrap}.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
@media(max-width:768px){
  .nav-center{display:none}.hamburger{display:flex}.nav-inner{padding:10px 16px}.nav-left span{font-size:20px;letter-spacing:2px}
  .nav-search{width:120px;padding:6px 10px}.nav-search:focus-within{width:140px}.nav-search input{font-size:10px}
  .section{padding:50px 16px}.hero{padding:80px 20px 60px}
  .products-grid{grid-template-columns:repeat(2,1fr);gap:8px}.product-info{padding:10px 10px 14px}.product-name{font-size:11px}.product-desc-short{display:none}.product-price{font-size:18px}
  .categories{gap:6px}.cat-btn{padding:6px 14px;font-size:10px}
  .floating-btns{bottom:16px;right:16px}.float-btn{width:46px;height:46px}.float-btn svg{width:22px;height:22px}
  .modal{grid-template-columns:1fr;max-height:95vh}.modal-img{aspect-ratio:1/1}.modal-details{padding:20px 18px}.modal-name{font-size:26px}
  .checkout-body{padding:18px 16px}.form-row{flex-direction:column;gap:10px}
  .footer-links{flex-direction:column;align-items:center;gap:16px}
}
</style>
</head>
<body>
<nav class="navbar" id="navbar"><div class="nav-inner">
  <div class="nav-left" onclick="scrollTo_('inicio')"><span>NAPOLITANO</span></div>
  <div class="nav-center"><a onclick="scrollTo_('inicio')">Inicio</a><a onclick="scrollTo_('productos')">Productos</a><a onclick="scrollTo_('footer')">Contacto</a></div>
  <div class="nav-right">
    <div class="nav-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input type="text" placeholder="Buscar..." oninput="searchProducts(this.value)"></div>
    <button class="cart-btn" onclick="openCart()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg><div class="cart-badge" id="cartBadge">0</div></button>
    <button class="hamburger" id="hamburger" onclick="toggleMenu()"><span></span><span></span><span></span></button>
  </div>
</div></nav>
<div class="mobile-menu" id="mobileMenu"><a onclick="scrollTo_('inicio');closeMenu()">Inicio</a><a onclick="scrollTo_('productos');closeMenu()">Productos</a><a onclick="scrollTo_('footer');closeMenu()">Contacto</a></div>
<section class="hero" id="inicio"><div class="hero-content">
  <div class="hero-brand">NAPOLITANO</div><p class="hero-tagline">Desde 2025 — Buenos Aires</p>
  <div class="hero-cta"><span onclick="scrollTo_('productos')">Ver Productos</span></div>
</div><div class="hero-scroll"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor"><path d="M19 9l-7 7-7-7"/></svg></div></section>
<div class="marquee-bar"><div class="marquee-track"><span>Envíos a CABA por motomensajería</span><span>·</span><span>Pagá con MercadoPago o Efectivo</span><span>·</span><span>Podés abonar al recibir</span><span>·</span><span>Envíos a CABA por motomensajería</span><span>·</span><span>Pagá con MercadoPago o Efectivo</span><span>·</span><span>Podés abonar al recibir</span><span>·</span><span>Envíos a CABA por motomensajería</span><span>·</span><span>Pagá con MercadoPago o Efectivo</span><span>·</span><span>Podés abonar al recibir</span><span>·</span></div></div>
<section class="section" id="productos">
  <div class="section-header reveal"><h2 class="section-title">Productos</h2></div>
  <div class="categories reveal">${catBtns}</div>
  <div class="products-search reveal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input type="text" placeholder="Buscar producto..." id="mainSearch" oninput="searchProducts(this.value)"></div>
  <div class="no-results" id="noResults">No se encontraron productos</div>
  <div class="products-grid" id="productsGrid">${productCards}</div>
</section>
<section class="section info-section"><div class="info-grid">
  <div class="info-card reveal"><div class="info-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div><h3>Envío rápido</h3><p>Motomensajería a todo CABA. Tu pedido llega el mismo día o al siguiente.</p></div>
  <div class="info-card reveal"><div class="info-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div><h3>MercadoPago</h3><p>Pagá con tarjeta, transferencia o dinero en cuenta de MercadoPago.</p></div>
  <div class="info-card reveal"><div class="info-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><h3>Pagá al recibir</h3><p>También aceptamos efectivo. Podés abonar cuando recibís tu pedido.</p></div>
</div></section>
<footer id="footer"><div class="footer-inner">
  <div class="footer-brand">NAPOLITANO</div>
  <div class="footer-links">
    <a href="https://www.instagram.com/napolitano.ba" target="_blank" class="footer-link"><svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg> Instagram</a>
    <a href="https://www.tiktok.com/@napolitano.ba?lang=es-419" target="_blank" class="footer-link"><svg viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.52a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48 6.3 6.3 0 001.86-4.49V8.76a8.26 8.26 0 004.86 1.57V6.88a4.84 4.84 0 01-1.14-.19z"/></svg> TikTok</a>
    <a href="https://wa.me/${WA_NUMBER}?text=Hola!%20Quiero%20consultar%20por%20productos%20de%20NapolitanoBA" target="_blank" class="footer-link"><svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> WhatsApp</a>
  </div>
  <div class="footer-divider"></div>
  <div class="footer-copy">&copy; 2026 NapolitanoBA — Buenos Aires, Argentina</div>
</div></footer>
<div class="modal-overlay" id="modalOverlay">
  <div class="modal">
    <button class="modal-close" onclick="closeProduct()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    <div class="modal-img"><img id="modalImg" src="" alt=""></div>
    <div class="modal-details">
      <div class="modal-category" id="modalCat"></div><h2 class="modal-name" id="modalName"></h2>
      <p class="modal-desc" id="modalDesc"></p>
      <div class="modal-price-row"><div class="modal-price" id="modalPrice"></div><div class="modal-cuotas">o 3 cuotas sin interés</div></div>
      <div class="modal-size"><label>Talle</label><div class="size-option" id="modalSize">Único</div></div>
      <div class="modal-actions">
        <button class="btn-cart" onclick="addToCart()">Agregar al Carrito</button>
        <button class="btn-wa" onclick="consultWa()"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>Consultar por WhatsApp</button>
      </div>
      <div class="modal-info-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>Envío por moto a CABA · MercadoPago o Efectivo</div>
    </div>
  </div>
</div>
<div class="cart-overlay" id="cartOverlay" onclick="closeCart()"></div>
<div class="cart-drawer" id="cartDrawer">
  <div class="cart-header"><h3>Tu Carrito</h3><button class="cart-close" onclick="closeCart()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
  <div class="cart-items" id="cartItems"><div class="cart-empty" id="cartEmpty">Tu carrito está vacío</div></div>
  <div class="cart-footer"><div class="cart-total"><span>Total</span><span id="cartTotal">$0</span></div><button class="cart-checkout" onclick="openCheckout()">Finalizar Compra</button></div>
</div>
<div class="checkout-overlay" id="checkoutOverlay">
  <div class="checkout-modal">
    <div class="checkout-header"><h3>Finalizar Compra</h3><button class="modal-close" onclick="closeCheckout()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
    <div class="checkout-body">
      <div class="checkout-section"><h4>Resumen del pedido</h4><div class="checkout-summary" id="checkoutSummary"></div></div>
      <div class="checkout-section"><h4>Datos personales</h4>
        <div class="form-row"><div class="form-group"><label>Nombre *</label><input id="cNombre" placeholder="Tu nombre"><span class="error-msg">Requerido</span></div><div class="form-group"><label>Apellido *</label><input id="cApellido" placeholder="Tu apellido"><span class="error-msg">Requerido</span></div></div>
        <div class="form-row"><div class="form-group"><label>DNI *</label><input id="cDni" placeholder="42123456" inputmode="numeric"><span class="error-msg">Requerido</span></div><div class="form-group"><label>Teléfono *</label><input id="cPhone" placeholder="1134240505" inputmode="tel"><span class="error-msg">Requerido</span></div></div>
        <div class="form-row"><div class="form-group"><label>Email *</label><input id="cEmail" type="email" placeholder="tu@email.com" style="width:100%"><span class="error-msg">Email inválido</span></div></div>
      </div>
      <div class="checkout-section"><h4>Datos de envío</h4>
        <div style="background:var(--off-white);padding:12px 16px;margin-bottom:16px;font-size:11px;color:var(--mid-gray);line-height:1.6;border-left:3px solid var(--dark)">📦 El envío se coordina por WhatsApp después de confirmar el pago. Te vamos a contactar para acordar día y horario de entrega.</div>
        <div class="form-row"><div class="form-group" style="flex:2"><label>Calle y número *</label><input id="cCalle" placeholder="Av. Corrientes 1234"><span class="error-msg">Requerido</span></div></div>
        <div class="form-row"><div class="form-group"><label>Localidad *</label><input id="cLocalidad" placeholder="CABA"><span class="error-msg">Requerido</span></div><div class="form-group"><label>Provincia *</label><input id="cProvincia" value="Buenos Aires"><span class="error-msg">Requerido</span></div></div>
        <div class="form-row"><div class="form-group"><label>Código Postal *</label><input id="cCp" placeholder="1043" inputmode="numeric"><span class="error-msg">Requerido</span></div><div class="form-group"><label>Edificio / Piso (opcional)</label><input id="cEdificio" placeholder="Piso 3, Depto B"></div></div>
      </div>
      <div class="checkout-section"><h4>Medio de pago</h4>
        <div class="payment-options"><div class="payment-opt active" onclick="selectPayment('mp',this)"><div class="po-title">MercadoPago</div><div class="po-sub">Tarjeta / Transferencia</div></div><div class="payment-opt" onclick="selectPayment('efectivo',this)"><div class="po-title">Efectivo</div><div class="po-sub">Pagás al recibir</div></div></div>
      </div>
      <button class="checkout-submit mp" id="checkoutSubmit" onclick="submitCheckout()">Pagar con MercadoPago</button>
    </div>
  </div>
</div>
<div class="floating-btns">
  <a href="https://wa.me/${WA_NUMBER}?text=Hola!%20Quiero%20consultar%20por%20productos" target="_blank" class="float-btn wa" title="WhatsApp"><svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></a>
  <a href="https://www.instagram.com/napolitano.ba" target="_blank" class="float-btn ig" title="Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg></a>
</div>
<div class="toast" id="toast"></div>
<script>
var WA='${WA_NUMBER}';
function scrollTo_(id){var el=document.getElementById(id);if(!el)return;var o=document.querySelector('.navbar').offsetHeight;window.scrollTo({top:el.getBoundingClientRect().top+window.pageYOffset-o,behavior:'smooth'})}
window.addEventListener('scroll',function(){document.getElementById('navbar').classList.toggle('scrolled',window.scrollY>50)});
function toggleMenu(){document.getElementById('hamburger').classList.toggle('active');document.getElementById('mobileMenu').classList.toggle('open');document.body.style.overflow=document.getElementById('mobileMenu').classList.contains('open')?'hidden':''}
function closeMenu(){document.getElementById('hamburger').classList.remove('active');document.getElementById('mobileMenu').classList.remove('open');document.body.style.overflow=''}
var observer=new IntersectionObserver(function(entries){entries.forEach(function(e,i){if(e.isIntersecting){setTimeout(function(){e.target.classList.add('visible')},i*50);observer.unobserve(e.target)}})},{threshold:0.08,rootMargin:'0px 0px -20px 0px'});
document.querySelectorAll('.reveal').forEach(function(el){observer.observe(el)});
var activeCat='Todos';
function filterCat(cat,btn){activeCat=cat;document.querySelectorAll('.cat-btn').forEach(function(b){b.classList.remove('active')});btn.classList.add('active');applyFilters()}
function searchProducts(q){document.querySelectorAll('.nav-search input,#mainSearch').forEach(function(inp){if(inp!==document.activeElement)inp.value=q});applyFilters()}
function applyFilters(){var q=(document.getElementById('mainSearch').value||'').toLowerCase().trim();var cards=document.querySelectorAll('.product-card');var found=0;cards.forEach(function(c){var nm=!q||c.dataset.name.toLowerCase().includes(q)||c.dataset.cat.toLowerCase().includes(q);var cm=activeCat==='Todos'||c.dataset.cat===activeCat;c.classList.toggle('hidden',!(nm&&cm));if(nm&&cm)found++});document.getElementById('noResults').style.display=found===0?'block':'none'}
var currentProduct={};
function openProduct(el){var p=parseInt(el.dataset.price);currentProduct={name:el.dataset.name,desc:el.dataset.desc,price:p,cat:el.dataset.cat,img:el.dataset.img,size:el.dataset.size||'Único'};document.getElementById('modalImg').src=currentProduct.img;document.getElementById('modalName').textContent=currentProduct.name;document.getElementById('modalDesc').textContent=currentProduct.desc;document.getElementById('modalPrice').textContent='$'+p.toLocaleString('es-AR');document.getElementById('modalCat').textContent=currentProduct.cat;document.getElementById('modalSize').textContent=currentProduct.size;document.getElementById('modalOverlay').classList.add('open');document.body.style.overflow='hidden'}
function closeProduct(){document.getElementById('modalOverlay').classList.remove('open');document.body.style.overflow=''}
function consultWa(){window.open('https://wa.me/'+WA+'?text='+encodeURIComponent('Hola, estoy interesado en '+currentProduct.name),'_blank')}
var cart=[];
try{var saved=sessionStorage.getItem('napolitano_cart');if(saved)cart=JSON.parse(saved)}catch(e){}
function saveCart(){try{sessionStorage.setItem('napolitano_cart',JSON.stringify(cart))}catch(e){}}
function addToCart(){cart.push(Object.assign({},currentProduct));saveCart();updateCartUI();closeProduct();showToast('Agregado al carrito')}
function removeFromCart(i){cart.splice(i,1);saveCart();updateCartUI()}
function getTotal(){return cart.reduce(function(s,item){return s+item.price},0)}
function updateCartUI(){var badge=document.getElementById('cartBadge');badge.textContent=cart.length;badge.classList.toggle('show',cart.length>0);var container=document.getElementById('cartItems');container.querySelectorAll('.cart-item').forEach(function(el){el.remove()});document.getElementById('cartEmpty').style.display=cart.length===0?'block':'none';cart.forEach(function(item,i){var div=document.createElement('div');div.className='cart-item';div.innerHTML='<div class="cart-item-img"><img src="'+item.img+'" alt="'+item.name+'"></div><div class="cart-item-info"><div class="cart-item-name">'+item.name+'</div><div class="cart-item-size">Talle: '+item.size+'</div><div class="cart-item-price">$'+item.price.toLocaleString('es-AR')+'</div></div><button class="cart-item-remove" onclick="removeFromCart('+i+')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>';container.appendChild(div)});document.getElementById('cartTotal').textContent='$'+getTotal().toLocaleString('es-AR')}
function openCart(){document.getElementById('cartOverlay').classList.add('open');document.getElementById('cartDrawer').classList.add('open');document.body.style.overflow='hidden'}
function closeCart(){document.getElementById('cartOverlay').classList.remove('open');document.getElementById('cartDrawer').classList.remove('open');document.body.style.overflow=''}
var paymentMethod='mp';
function openCheckout(){if(cart.length===0)return;closeCart();var html='';cart.forEach(function(item){html+='<div class="checkout-summary-item"><span>'+item.name+'</span><span>$'+item.price.toLocaleString('es-AR')+'</span></div>'});html+='<div class="checkout-summary-item total"><span>Total</span><span>$'+getTotal().toLocaleString('es-AR')+'</span></div>';document.getElementById('checkoutSummary').innerHTML=html;document.getElementById('checkoutOverlay').classList.add('open');document.body.style.overflow='hidden';updateSubmitBtn()}
function closeCheckout(){document.getElementById('checkoutOverlay').classList.remove('open');document.body.style.overflow=''}
function selectPayment(m,el){paymentMethod=m;document.querySelectorAll('.payment-opt').forEach(function(o){o.classList.remove('active')});el.classList.add('active');updateSubmitBtn()}
function updateSubmitBtn(){var btn=document.getElementById('checkoutSubmit');if(paymentMethod==='mp'){btn.textContent='Pagar con MercadoPago';btn.className='checkout-submit mp'}else{btn.textContent='Confirmar Pedido por WhatsApp';btn.className='checkout-submit'}}
function submitCheckout(){
  var fields=[{id:'cNombre',req:true},{id:'cApellido',req:true},{id:'cDni',req:true},{id:'cPhone',req:true},{id:'cEmail',req:true,email:true},{id:'cCalle',req:true},{id:'cLocalidad',req:true},{id:'cProvincia',req:true},{id:'cCp',req:true}];
  var valid=true;fields.forEach(function(f){var inp=document.getElementById(f.id);var val=inp.value.trim();var err=false;if(f.req&&!val)err=true;if(f.email&&val&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(val))err=true;inp.classList.toggle('error',err);if(err)valid=false});
  if(!valid){showToast('Completá todos los campos obligatorios');return}
  var d={nombre:document.getElementById('cNombre').value.trim(),apellido:document.getElementById('cApellido').value.trim(),dni:document.getElementById('cDni').value.trim(),phone:document.getElementById('cPhone').value.trim(),email:document.getElementById('cEmail').value.trim(),calle:document.getElementById('cCalle').value.trim(),localidad:document.getElementById('cLocalidad').value.trim(),provincia:document.getElementById('cProvincia').value.trim(),cp:document.getElementById('cCp').value.trim(),edificio:document.getElementById('cEdificio').value.trim()};
  if(paymentMethod==='efectivo'){
    var msg='Hola! Quiero hacer un pedido en NapolitanoBA (Efectivo):\\n\\n*Productos:*\\n';
    cart.forEach(function(item){msg+='• '+item.name+' - $'+item.price.toLocaleString('es-AR')+'\\n'});
    msg+='\\n*Total: $'+getTotal().toLocaleString('es-AR')+'*\\n\\n*Datos:*\\n'+d.nombre+' '+d.apellido+'\\nDNI: '+d.dni+'\\nTel: '+d.phone+'\\nEmail: '+d.email+'\\n\\n*Envío:*\\n'+d.calle+', '+d.localidad+', '+d.provincia+' (CP '+d.cp+')';
    if(d.edificio)msg+='\\n'+d.edificio;msg+='\\n\\nPago en efectivo al recibir';
    fetch('/api/orden-efectivo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:cart.map(function(item){return{name:item.name,price:item.price}}),customer:d})});
    window.open('https://wa.me/'+WA+'?text='+encodeURIComponent(msg),'_blank');
    showToast('Pedido enviado por WhatsApp');cart=[];saveCart();updateCartUI();closeCheckout()
  } else {
    document.getElementById('checkoutSubmit').textContent='Procesando...';document.getElementById('checkoutSubmit').disabled=true;
    fetch('/api/crear-pago',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:cart.map(function(item){return{name:item.name,price:item.price}}),customer:d})})
    .then(function(r){return r.json()}).then(function(data){
      if(data.ok){cart=[];saveCart();updateCartUI();window.location.href=data.init_point}
      else{showToast('Error al crear el pago');document.getElementById('checkoutSubmit').textContent='Pagar con MercadoPago';document.getElementById('checkoutSubmit').disabled=false}
    }).catch(function(){showToast('Error de conexión');document.getElementById('checkoutSubmit').textContent='Pagar con MercadoPago';document.getElementById('checkoutSubmit').disabled=false})
  }
}
function showToast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},3000)}
</script>
</body></html>`;
}

function renderAdminLogin(error = '') {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Admin — NapolitanoBA</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Outfit',sans-serif;background:#111;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}
.login-box{background:#1a1a1a;padding:48px 40px;width:min(400px,90vw);text-align:center}
.login-box h1{font-family:'Bebas Neue',sans-serif;font-size:36px;letter-spacing:4px;margin-bottom:8px}
.login-box p{font-size:12px;color:#666;margin-bottom:32px;letter-spacing:1px}
.login-box input{width:100%;padding:14px 18px;border:1.5px solid #333;background:transparent;color:#fff;font-family:'Outfit',sans-serif;font-size:14px;outline:none;margin-bottom:16px;transition:border-color 0.3s}
.login-box input:focus{border-color:#fff}
.login-box button{width:100%;padding:14px;border:none;background:#fff;color:#111;font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:background 0.3s}
.login-box button:hover{background:#ddd}
.error{color:#e53935;font-size:12px;margin-bottom:16px}
</style></head><body>
<div class="login-box"><h1>NAPOLITANO</h1><p>Panel de Administración</p>
${error ? '<div class="error">' + error + '</div>' : ''}
<form method="POST" action="/admin/login"><input type="password" name="password" placeholder="Contraseña" autofocus><button type="submit">Ingresar</button></form>
</div></body></html>`;
}

function renderAdmin(products, orders) {
  const categories = ['Remeras','Bermudas','Buzos','Pantalones','Conjuntos','Zapatillas','Accesorios','Perfumes'];
  const catOptions = categories.map(c => `<option value="${c}">${c}</option>`).join('');
  
  const productRows = products.map(p => {
    const img = p.image ? `<img src="${p.image}" style="width:50px;height:65px;object-fit:cover">` : '<div style="width:50px;height:65px;background:#333;display:flex;align-items:center;justify-content:center;font-size:10px;color:#666">Sin foto</div>';
    return `<tr data-id="${p.id}" class="${p.active ? '' : 'inactive'}">
      <td>${img}</td><td>${p.name}</td><td>${p.category}</td><td>$${p.price.toLocaleString('es-AR')}</td><td>${p.size || 'Único'}</td><td>${p.badge || '-'}</td>
      <td><span class="status ${p.active ? 'on' : 'off'}">${p.active ? 'Activo' : 'Oculto'}</span></td>
      <td class="actions">
        <button onclick="toggleProduct(${p.id})" class="btn-sm">${p.active ? '👁️' : '👁️‍🗨️'}</button>
        <button onclick="editProduct(${p.id})" class="btn-sm">✏️</button>
        <button onclick="deleteProduct(${p.id})" class="btn-sm btn-danger">🗑️</button>
      </td></tr>`;
  }).join('');

  const orderRows = orders.map(o => {
    const items = JSON.parse(o.products_json || '[]');
    const itemsList = items.map(i => '• ' + i.name + ' - $' + (i.price||0).toLocaleString('es-AR')).join('<br>');
    const addr = JSON.parse(o.shipping_address || '{}');
    const addrText = [addr.calle, addr.localidad, addr.provincia, addr.cp ? 'CP ' + addr.cp : '', addr.edificio].filter(Boolean).join(', ');
    const statusClass = o.payment_status === 'approved' ? 'on' : 'off';
    const statusText = o.payment_status === 'approved' ? 'Aprobado' : o.payment_status === 'pending' ? 'Pendiente' : o.payment_status || 'Pendiente';
    return `<tr>
      <td style="font-weight:700">#${o.id}</td>
      <td><strong>${o.customer_name || '-'}</strong><br><small style="color:#888">DNI: ${o.customer_dni || '-'}</small></td>
      <td>${o.customer_phone || '-'}</td>
      <td><small>${o.customer_email || '-'}</small></td>
      <td style="max-width:250px">${itemsList || '-'}</td>
      <td style="font-weight:700;font-size:15px">$${(o.total||0).toLocaleString('es-AR')}</td>
      <td><span class="status ${statusClass}">${statusText}</span></td>
      <td style="max-width:200px;font-size:11px;color:#888">${addrText || '-'}</td>
      <td style="font-size:11px;color:#888">${o.mp_payment_id || '-'}</td>
      <td style="font-size:11px;color:#888;white-space:nowrap">${o.created_at || '-'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center;padding:40px;color:#666">No hay pedidos por MercadoPago aún</td></tr>';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Admin — NapolitanoBA</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Outfit',sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh}
.admin-header{background:#111;border-bottom:1px solid #222;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.admin-header h1{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:3px}
.admin-header .links{display:flex;gap:16px;align-items:center}
.admin-header a{color:#888;font-size:12px;letter-spacing:1px;text-decoration:none;transition:color 0.2s}.admin-header a:hover{color:#fff}
.admin-body{max-width:1200px;margin:0 auto;padding:32px}
.tabs{display:flex;gap:4px;margin-bottom:24px}
.tab{padding:10px 24px;background:#1a1a1a;border:1px solid #222;color:#888;font-size:12px;font-weight:500;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all 0.2s}
.tab.active{background:#fff;color:#111;border-color:#fff}
.tab-content{display:none}.tab-content.active{display:block}
.card{background:#111;border:1px solid #222;padding:24px;margin-bottom:24px}
.card h2{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#666;padding:10px 12px;border-bottom:1px solid #222}
td{padding:10px 12px;border-bottom:1px solid #1a1a1a;font-size:13px;vertical-align:middle}
tr.inactive{opacity:0.5}
.status{font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:4px 10px;font-weight:600}
.status.on{background:#1a3a1a;color:#4caf50}.status.off{background:#3a1a1a;color:#e53935}
.btn-sm{background:none;border:1px solid #333;padding:6px 10px;cursor:pointer;font-size:14px;transition:all 0.2s;border-radius:4px}
.btn-sm:hover{border-color:#888;background:#1a1a1a}.btn-danger:hover{border-color:#e53935;background:#3a1a1a}
.actions{display:flex;gap:6px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.form-group{display:flex;flex-direction:column;gap:6px}
.form-group.full{grid-column:1/-1}
.form-group label{font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#888}
.form-group input,.form-group select,.form-group textarea{padding:10px 14px;border:1px solid #333;background:#0a0a0a;color:#e0e0e0;font-family:'Outfit',sans-serif;font-size:13px;outline:none;transition:border-color 0.2s}
.form-group input:focus,.form-group select:focus,.form-group textarea:focus{border-color:#fff}
.form-group textarea{resize:vertical;min-height:80px}
.btn-primary{padding:12px 32px;border:none;background:#fff;color:#111;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:background 0.2s;margin-top:16px}
.btn-primary:hover{background:#ddd}
.btn-secondary{padding:12px 32px;border:1px solid #444;background:transparent;color:#e0e0e0;font-family:'Outfit',sans-serif;font-size:12px;font-weight:500;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:all 0.2s;margin-top:16px;margin-left:8px}
.btn-secondary:hover{border-color:#fff}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;z-index:200}
.modal-bg.open{display:flex}
.admin-modal{background:#111;border:1px solid #333;width:min(600px,94vw);max-height:90vh;overflow-y:auto;padding:32px}
.admin-modal h3{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;margin-bottom:20px}
.toast{position:fixed;bottom:24px;right:24px;background:#1a3a1a;color:#4caf50;padding:14px 24px;font-size:12px;letter-spacing:1px;opacity:0;transition:opacity 0.3s;z-index:300}.toast.show{opacity:1}
@media(max-width:768px){.admin-body{padding:16px}.form-grid{grid-template-columns:1fr}.admin-header{padding:12px 16px}.tabs{flex-wrap:wrap}}
</style></head><body>
<div class="admin-header">
  <h1>NAPOLITANO — ADMIN</h1>
  <div class="links"><a href="/" target="_blank">Ver tienda ↗</a><a href="/admin/logout">Cerrar sesión</a></div>
</div>
<div class="admin-body">
  <div class="tabs">
    <div class="tab active" onclick="switchTab('products',this)">Productos</div>
    <div class="tab" onclick="switchTab('orders',this)">Pedidos</div>
  </div>
  <div class="tab-content active" id="tab-products">
    <div class="card">
      <h2>Agregar Producto</h2>
      <form id="addForm" enctype="multipart/form-data" onsubmit="return addProduct(event)">
        <div class="form-grid">
          <div class="form-group"><label>Nombre *</label><input name="name" required placeholder="Nombre del producto"></div>
          <div class="form-group"><label>Precio *</label><input name="price" type="number" required placeholder="45000"></div>
          <div class="form-group"><label>Categoría</label><select name="category">${catOptions}</select></div>
          <div class="form-group"><label>Talle</label><input name="size" value="Único" placeholder="Único / S,M,L,XL"></div>
          <div class="form-group"><label>Badge</label><input name="badge" placeholder="Nuevo, Popular, Combo..."></div>
          <div class="form-group"><label>Imagen</label><input name="image" type="file" accept="image/*"></div>
          <div class="form-group full"><label>Descripción</label><textarea name="description" placeholder="Descripción del producto..."></textarea></div>
        </div>
        <button type="submit" class="btn-primary">Agregar Producto</button>
      </form>
    </div>
    <div class="card">
      <h2>Productos (${products.length})</h2>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>Foto</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Talle</th><th>Badge</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody id="productsTable">${productRows}</tbody>
      </table></div>
    </div>
  </div>
  <div class="tab-content" id="tab-orders">
    <div class="card">
      <h2>Pedidos Recientes</h2>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>N° Pedido</th><th>Cliente</th><th>Teléfono</th><th>Email</th><th>Productos</th><th>Total</th><th>Estado</th><th>Dirección</th><th>ID Pago MP</th><th>Fecha</th></tr></thead>
        <tbody>${orderRows}</tbody>
      </table></div>
    </div>
  </div>
</div>
<div class="modal-bg" id="editModal" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="admin-modal">
    <h3>Editar Producto</h3>
    <form id="editForm" enctype="multipart/form-data" onsubmit="return updateProduct(event)">
      <input type="hidden" id="editId">
      <div class="form-grid">
        <div class="form-group"><label>Nombre *</label><input id="editName" required></div>
        <div class="form-group"><label>Precio *</label><input id="editPrice" type="number" required></div>
        <div class="form-group"><label>Categoría</label><select id="editCategory">${catOptions}</select></div>
        <div class="form-group"><label>Talle</label><input id="editSize"></div>
        <div class="form-group"><label>Badge</label><input id="editBadge"></div>
        <div class="form-group"><label>Nueva imagen (opcional)</label><input id="editImage" type="file" accept="image/*"></div>
        <div class="form-group full"><label>Descripción</label><textarea id="editDesc"></textarea></div>
      </div>
      <button type="submit" class="btn-primary">Guardar Cambios</button>
      <button type="button" class="btn-secondary" onclick="document.getElementById('editModal').classList.remove('open')">Cancelar</button>
    </form>
  </div>
</div>
<div class="toast" id="adminToast"></div>
<script>
function switchTab(id,btn){document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));document.getElementById('tab-'+id).classList.add('active')}
function toast(msg){var t=document.getElementById('adminToast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
function addProduct(e){
  e.preventDefault();var form=document.getElementById('addForm');var fd=new FormData(form);
  fetch('/api/products',{method:'POST',body:fd}).then(r=>r.json()).then(d=>{if(d.ok){toast('Producto agregado');setTimeout(()=>location.reload(),500)}else toast('Error')}).catch(()=>toast('Error'));return false}
function toggleProduct(id){
  fetch('/api/products/'+id+'/toggle',{method:'PUT'}).then(r=>r.json()).then(d=>{if(d.ok){toast(d.active?'Producto activado':'Producto oculto');setTimeout(()=>location.reload(),500)}}).catch(()=>toast('Error'))}
function editProduct(id){
  var row=document.querySelector('tr[data-id="'+id+'"]');if(!row)return;
  var cells=row.querySelectorAll('td');
  document.getElementById('editId').value=id;
  document.getElementById('editName').value=cells[1].textContent;
  document.getElementById('editCategory').value=cells[2].textContent;
  document.getElementById('editPrice').value=parseInt(cells[3].textContent.replace(/[^0-9]/g,''));
  document.getElementById('editSize').value=cells[4].textContent;
  document.getElementById('editBadge').value=cells[5].textContent==='-'?'':cells[5].textContent;
  document.getElementById('editModal').classList.add('open')}
function updateProduct(e){
  e.preventDefault();var id=document.getElementById('editId').value;var fd=new FormData();
  fd.append('name',document.getElementById('editName').value);fd.append('price',document.getElementById('editPrice').value);
  fd.append('category',document.getElementById('editCategory').value);fd.append('size',document.getElementById('editSize').value);
  fd.append('badge',document.getElementById('editBadge').value);fd.append('description',document.getElementById('editDesc').value);
  var img=document.getElementById('editImage').files[0];if(img)fd.append('image',img);
  fetch('/api/products/'+id,{method:'PUT',body:fd}).then(r=>r.json()).then(d=>{if(d.ok){toast('Producto actualizado');setTimeout(()=>location.reload(),500)}}).catch(()=>toast('Error'));return false}
function deleteProduct(id){if(!confirm('¿Eliminar este producto?'))return;
  fetch('/api/products/'+id,{method:'DELETE'}).then(r=>r.json()).then(d=>{if(d.ok){toast('Producto eliminado');setTimeout(()=>location.reload(),500)}}).catch(()=>toast('Error'))}
</script></body></html>`;
}

function renderPaymentSuccess(orderId, order) {
  let productsHtml = '';
  let customerHtml = '';
  let addressHtml = '';
  let totalHtml = '';
  
  if (order) {
    const items = JSON.parse(order.products_json || '[]');
    productsHtml = items.map(function(i) { return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #222"><span>' + i.name + '</span><span>$' + (i.price||0).toLocaleString('es-AR') + '</span></div>'; }).join('');
    totalHtml = '<div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700;font-size:16px;border-top:1px solid #444;margin-top:8px"><span>Total</span><span>$' + (order.total||0).toLocaleString('es-AR') + '</span></div>';
    customerHtml = '<div style="font-size:13px;color:#aaa;line-height:1.8">' + (order.customer_name || '') + '<br>DNI: ' + (order.customer_dni || '') + '<br>Tel: ' + (order.customer_phone || '') + '<br>Email: ' + (order.customer_email || '') + '</div>';
    var addr = JSON.parse(order.shipping_address || '{}');
    addressHtml = '<div style="font-size:13px;color:#aaa;line-height:1.8">' + [addr.calle, addr.localidad, addr.provincia, addr.cp ? 'CP ' + addr.cp : '', addr.edificio].filter(Boolean).join(', ') + '</div>';
  }

  var oid = orderId || '-';
  var waMsg = encodeURIComponent('Hola! Hice el pedido #' + (orderId || '') + ' y quiero coordinar el envío');

  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Pago Exitoso — NapolitanoBA</title>'
  + '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Bebas+Neue&display=swap" rel="stylesheet">'
  + '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Outfit",sans-serif;background:#111;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}'
  + '.container{max-width:520px;width:100%}'
  + '.header{text-align:center;margin-bottom:32px}'
  + '.header h1{font-family:"Bebas Neue",sans-serif;font-size:42px;letter-spacing:3px;color:#4caf50;margin-bottom:8px}'
  + '.header p{font-size:13px;color:#888}'
  + '.card{background:#1a1a1a;border:1px solid #222;padding:24px;margin-bottom:16px}'
  + '.card h3{font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#666;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #222}'
  + '.wa-banner{background:#1a3a1a;border:1px solid #25D366;padding:20px;text-align:center;margin-bottom:16px}'
  + '.wa-banner p{font-size:13px;color:#aaa;margin-bottom:12px;line-height:1.6}'
  + '.wa-banner a{display:inline-block;padding:12px 32px;background:#25D366;color:#fff;text-decoration:none;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;transition:background 0.3s}'
  + '.wa-banner a:hover{background:#1ebe57}'
  + '.back{display:block;text-align:center;padding:16px;border:1px solid #333;color:#fff;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase;transition:all 0.3s}'
  + '.back:hover{background:#fff;color:#111}'
  + '</style></head><body>'
  + '<div class="container">'
  + '<div class="header"><h1>Pago Exitoso!</h1><p>Pedido #' + oid + ' confirmado</p></div>'
  + '<div class="card"><h3>Productos</h3>' + productsHtml + totalHtml + '</div>'
  + '<div class="card"><h3>Tus datos</h3>' + customerHtml + '</div>'
  + '<div class="card"><h3>Direccion de envio</h3>' + addressHtml + '</div>'
  + '<div class="wa-banner"><p>Comunicate por WhatsApp para coordinar el envio de tu pedido #' + oid + '</p>'
  + '<a href="https://wa.me/' + WA_NUMBER + '?text=' + waMsg + '" target="_blank">Coordinar envio por WhatsApp</a></div>'
  + '<a href="/" class="back">Volver a la tienda</a>'
  + '</div></body></html>';
}

function renderPaymentResult(status, orderId) {
  const msgs = {
    success: { title: '¡Pago Exitoso!', desc: 'Tu pedido fue procesado correctamente. Te contactaremos para coordinar el envío.', color: '#4caf50' },
    failure: { title: 'Pago Fallido', desc: 'Hubo un problema con tu pago. Podés intentar de nuevo o contactarnos por WhatsApp.', color: '#e53935' },
    pending: { title: 'Pago Pendiente', desc: 'Tu pago está siendo procesado. Te notificaremos cuando se confirme.', color: '#ff9800' },
  };
  const m = msgs[status] || msgs.pending;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${m.title} — NapolitanoBA</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Outfit',sans-serif;background:#111;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px}
.result{max-width:500px}.result h1{font-family:'Bebas Neue',sans-serif;font-size:48px;letter-spacing:3px;color:${m.color};margin-bottom:16px}
.result p{font-size:14px;color:#aaa;line-height:1.7;margin-bottom:32px}
.result a{display:inline-block;padding:14px 40px;border:1px solid #fff;color:#fff;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase;transition:all 0.3s}
.result a:hover{background:#fff;color:#111}</style></head><body>
<div class="result"><h1>${m.title}</h1><p>${m.desc}${orderId ? '<br>Pedido #' + orderId : ''}</p><a href="/">Volver a la tienda</a></div></body></html>`;
}

// ─── START ───
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 NapolitanoBA corriendo en http://localhost:${PORT}`);
    console.log(`📋 Admin: http://localhost:${PORT}/admin`);
    console.log(`🔑 Contraseña admin: ${ADMIN_PASSWORD}`);
    console.log(`💾 DB path: ${DB_PATH}`);
    console.log(`🔗 N8N webhook: ${N8N_WEBHOOK_URL}`);
  });

  // Auto-save DB every 30 seconds to prevent data loss
  setInterval(() => {
    try { saveDB(); } catch(e) { console.error('Auto-save error:', e.message); }
  }, 30000);

  // Save DB on shutdown
  process.on('SIGTERM', () => { console.log('Shutting down...'); saveDB(); process.exit(0); });
  process.on('SIGINT', () => { console.log('Shutting down...'); saveDB(); process.exit(0); });
});
