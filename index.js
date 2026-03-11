"use strict";
const express = require("express");
// FormData y Blob son built-in en Node.js 18+ — no se importan
const app = express();

// ============================================================
// VARIABLES DE ENTORNO
// ============================================================
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VERIFY_TOKEN      = process.env.WHATSAPP_VERIFY_TOKEN || "miyu2026";
const WHATSAPP_TOKEN    = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID   = process.env.PHONE_NUMBER_ID;
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY || null;
const PORT              = process.env.PORT || 3000;
const ADMIN_TOKEN       = process.env.ADMIN_TOKEN || "miyu-admin-2026";

// Validar variables críticas al arranque (warnings, no crash)
const missingVars = [];
if (!ANTHROPIC_API_KEY) missingVars.push("ANTHROPIC_API_KEY");
if (!WHATSAPP_TOKEN)    missingVars.push("WHATSAPP_TOKEN");
if (!PHONE_NUMBER_ID)   missingVars.push("PHONE_NUMBER_ID");
if (missingVars.length > 0) {
  console.error(`⚠️  Variables de entorno faltantes: ${missingVars.join(", ")}`);
  console.error("El servidor inicia, pero esas funciones no estarán disponibles.");
}

// ============================================================
// MIDDLEWARE GLOBAL
// ============================================================
app.use(express.json({ limit: "6mb" }));

// Headers de seguridad (CSP, anti-clickjacking, etc.)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "script-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
    ].join("; ")
  );
  next();
});

// ============================================================
// ESTADO EN MEMORIA
// ============================================================
const conversaciones   = {};  // historial por teléfono
const perfilesClientes = {};  // perfil por teléfono
const contadorTrolls   = {};  // contador mensajes ofensivos
const modoPausa        = {};  // true = humano en control
const rateLimiter      = {};  // timestamps de mensajes por teléfono

// ── INVENTARIO ──────────────────────────────────────────────
const inventario = {
  "beauty-of-joseon-sun": { id:"beauty-of-joseon-sun", nombre:"Beauty of Joseon Relief Sun Rice + Probiotics SPF50+ PA++++", precio:550, stock:10, stockMinimo:3, categoria:"solar",      descripcion:"Viral en TikTok. Acabado sérico, no deja residuo blanco. Ideal piel mixta/grasa.", imagenUrl:"", activo:true, vendidos:0 },
  "biore-uv-aqua":        { id:"biore-uv-aqua",        nombre:"Bioré UV Aqua Rich Watery Essence SPF50+",                   precio:475, stock:8,  stockMinimo:3, categoria:"solar",      descripcion:"Clásico japonés. Textura de agua, se absorbe al instante. Perfecta bajo maquillaje.", imagenUrl:"", activo:true, vendidos:0 },
  "shiseido-aqua":        { id:"shiseido-aqua",        nombre:"Mascarilla Shiseido Aqua Intensive",                          precio:500, stock:6,  stockMinimo:2, categoria:"capilar",    descripcion:"Hidratación profunda para cabello seco o dañado.", imagenUrl:"", activo:true, vendidos:0 },
  "honey-aceite-capilar": { id:"honey-aceite-capilar", nombre:"&Honey Deep Moist Aceite Capilar",                            precio:500, stock:7,  stockMinimo:2, categoria:"capilar",    descripcion:"Superventas en Japón. Brillo tipo K-pop sin residuo graso.", imagenUrl:"", activo:true, vendidos:0 },
  "cer100-hair-filler":   { id:"cer100-hair-filler",   nombre:"CER-100 Hair Filler Ceramide Treatment",                      precio:395, stock:9,  stockMinimo:3, categoria:"capilar",    descripcion:"Tratamiento de ceramidas. Rellena fibra capilar dañada.", imagenUrl:"", activo:true, vendidos:0 },
  "tirtir-cushion":       { id:"tirtir-cushion",       nombre:"Tirtir Cushion Mask Fit Red (varios tonos)",                  precio:800, stock:5,  stockMinimo:2, categoria:"maquillaje", descripcion:"El cushion más famoso de K-beauty. Cobertura media-alta, acabado luminoso.", imagenUrl:"", activo:true, vendidos:0 },
  "heroine-mascara":      { id:"heroine-mascara",      nombre:"Mascara Heroine Make Long & Curl",                            precio:450, stock:8,  stockMinimo:3, categoria:"maquillaje", descripcion:"Ícono del maquillaje japonés. Alarga y riza, resistente al agua.", imagenUrl:"", activo:true, vendidos:0 },
  "removedor-bifasico":   { id:"removedor-bifasico",   nombre:"Removedor de Maquillaje Bifásico",                            precio:450, stock:10, stockMinimo:3, categoria:"maquillaje", descripcion:"Elimina maquillaje waterproof sin restregar.", imagenUrl:"", activo:true, vendidos:0 },
  "delineador-waterproof":{ id:"delineador-waterproof",nombre:"Delineador Waterproof Ultra Fino",                            precio:450, stock:12, stockMinimo:3, categoria:"maquillaje", descripcion:"Trazo de precisión, no corre todo el día.", imagenUrl:"", activo:true, vendidos:0 },
  "rizador-repuesto":     { id:"rizador-repuesto",     nombre:"Repuesto Rizador de Pestañas",                                precio:79,  stock:20, stockMinimo:5, categoria:"maquillaje", descripcion:"Repuesto compatible con rizadores estándar.", imagenUrl:"", activo:true, vendidos:0 },
  "mascarilla-arroz":     { id:"mascarilla-arroz",     nombre:"Mascarilla de Arroz Exfoliante",                              precio:550, stock:7,  stockMinimo:2, categoria:"skincare",   descripcion:"Exfolia suavemente. Ingrediente estrella del skincare coreano.", imagenUrl:"", activo:true, vendidos:0 },
  "centellian-madeca":    { id:"centellian-madeca",    nombre:"Centellian 24 Madeca Cream",                                  precio:579, stock:6,  stockMinimo:2, categoria:"skincare",   descripcion:"Centella asiática. Calma rojeces y regenera.", imagenUrl:"", activo:true, vendidos:0 },
  "dynasty-cream":        { id:"dynasty-cream",        nombre:"Dynasty Cream Lifting & Firming",                             precio:665, stock:5,  stockMinimo:2, categoria:"skincare",   descripcion:"Efecto tensor y reafirmante. Ideal pieles maduras.", imagenUrl:"", activo:true, vendidos:0 },
  "boj-parches-ojos":     { id:"boj-parches-ojos",     nombre:"Parches de Ojos Beauty of Joseon",                           precio:620, stock:8,  stockMinimo:3, categoria:"skincare",   descripcion:"Desinflamar contorno de ojos en 20 minutos.", imagenUrl:"", activo:true, vendidos:0 },
  "mixsoon-bean-eye":     { id:"mixsoon-bean-eye",     nombre:"Mixsoon Bean Eye Cream",                                      precio:625, stock:6,  stockMinimo:2, categoria:"skincare",   descripcion:"Extracto de soya. Hidratación y luminosidad bajo ojos.", imagenUrl:"", activo:true, vendidos:0 },
  "medicube-pdrn":        { id:"medicube-pdrn",        nombre:"Medicube PDRN Peptide Serum",                                 precio:695, stock:5,  stockMinimo:2, categoria:"skincare",   descripcion:"Tecnología de clínicas coreanas. Estimula regeneración celular.", imagenUrl:"", activo:true, vendidos:0 },
  "medicube-kojic":       { id:"medicube-kojic",       nombre:"Medicube Kojic Acid Serum",                                   precio:695, stock:5,  stockMinimo:2, categoria:"skincare",   descripcion:"Ácido kójico para manchas e hiperpigmentación.", imagenUrl:"", activo:true, vendidos:0 },
  "anua-heartleaf-set":   { id:"anua-heartleaf-set",   nombre:"Set Anua Heartleaf (limpiador + tónico)",                    precio:720, stock:6,  stockMinimo:2, categoria:"skincare",   descripcion:"Marca viral k-beauty. Calma, hidrata, trata acné.", imagenUrl:"", activo:true, vendidos:0 },
  "mixsoon-glass-skin":   { id:"mixsoon-glass-skin",   nombre:"Mixsoon Glass Skin Kit",                                      precio:820, stock:4,  stockMinimo:2, categoria:"skincare",   descripcion:"Kit completo para el efecto glass skin coreano.", imagenUrl:"", activo:true, vendidos:0 },
  "parches-juanetes":     { id:"parches-juanetes",     nombre:"Parches para Juanetes Kyusoku Jikan",                         precio:120, stock:15, stockMinimo:5, categoria:"salud",      descripcion:"Alivio y corrección gradual para juanetes.", imagenUrl:"", activo:true, vendidos:0 },
};

// ── PEDIDOS ──────────────────────────────────────────────────
const pedidos = {};
let contadorPedidos = 1;
function generarIdPedido() {
  const año = new Date().getFullYear();
  return `PED-${año}-${String(contadorPedidos++).padStart(4,"0")}`;
}

// ── SEGUIMIENTOS AUTOMÁTICOS ──────────────────────────────────
const seguimientosAuto = {};  // { telefono: [{ tipo, mensaje, enviarEn, enviado, enviadoEn }] }

// ── LEAD SCORING ──────────────────────────────────────────────
const leadScores = {};  // { telefono: { score, productos, señales, ultimaActualizacion } }

// ── MÉTRICAS ──────────────────────────────────────────────────
const metricas = {
  fechaInicio:          new Date().toISOString(),
  totalConversaciones:  0,
  totalPedidos:         0,
  pedidosConfirmados:   0,
  pedidosCancelados:    0,
  ingresoTotal:         0,
  ingresoHoy:           0,
  pedidosHoy:           0,
  mensajesHoy:          0,
  clientesNuevos:       0,
  productosMencionados: {},  // { productoId: veces }
  pedidosPorEstado:     { pendiente:0, confirmado:0, preparando:0, enviado:0, entregado:0, cancelado:0 },
  ultimoReset:          new Date().toDateString(),
};

// Limpieza de memoria: eliminar conversaciones inactivas > 7 días
setInterval(() => {
  const limite = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const tel of Object.keys(conversaciones)) {
    const perfil = perfilesClientes[tel];
    if (!perfil || new Date(perfil.ultimoMensaje).getTime() < limite) {
      delete conversaciones[tel];
      delete perfilesClientes[tel];
      delete contadorTrolls[tel];
      delete modoPausa[tel];
      delete rateLimiter[tel];
      delete leadScores[tel];
      delete seguimientosAuto[tel];
      console.log(`🧹 Conversación inactiva limpiada: ${tel}`);
    }
  }
}, 60 * 60 * 1000); // Cada hora

// Scheduler de seguimientos automáticos — revisa cada minuto
setInterval(async () => {
  const ahora = Date.now();
  for (const tel of Object.keys(seguimientosAuto)) {
    const lista = seguimientosAuto[tel];
    if (!Array.isArray(lista)) continue;
    for (const seg of lista) {
      if (!seg.enviado && seg.enviarEn && ahora >= seg.enviarEn) {
        const resultado = await enviarMensaje(tel, seg.mensaje);
        if (resultado.ok) {
          seg.enviado   = true;
          seg.enviadoEn = new Date().toISOString();
          console.log(`📨 Seguimiento automático [${seg.tipo}] enviado a ${tel}`);
          if (!conversaciones[tel]) conversaciones[tel] = [];
          conversaciones[tel].push({ role:"assistant", content:`[Seguimiento]: ${seg.mensaje}`, ts:new Date().toISOString() });
        }
      }
    }
  }
}, 60 * 1000);

// Reset de métricas diarias a medianoche
setInterval(() => {
  const hoy = new Date().toDateString();
  if (metricas.ultimoReset !== hoy) {
    metricas.ingresoHoy   = 0;
    metricas.pedidosHoy   = 0;
    metricas.mensajesHoy  = 0;
    metricas.ultimoReset  = hoy;
  }
}, 60 * 1000);

// ============================================================
// SYSTEM PROMPT MIYU BEAUTY
// ============================================================
const SYSTEM_PROMPT = `Eres asesora de ventas de Miyu Beauty, tienda especializada en maquillaje y skincare coreano/japonés en Mazatlán, Sinaloa.

PERSONALIDAD: Eres cálida y conocedora del k-beauty. Hablas en español mexicano natural, como una amiga que sabe de skincare. Eres concisa: respuestas cortas y directas, máximo 3-4 oraciones por mensaje. Usas máximo 1 o 2 emojis por respuesta, nunca más. No uses asteriscos para negritas en conversación normal, solo úsalos en listas de productos o precios. Cuando pregunten por un producto, da lo más importante en pocas palabras: qué hace, para quién es ideal, y si lo usan maquillistas. Nunca presiones, pero sí orienta.

CATÁLOGO COMPLETO:
🌞 PROTECCIÓN SOLAR:
- Beauty of Joseon Relief Sun Rice + Probiotics SPF50+ PA++++ $550
  → Viral en TikTok y YouTube de k-beauty. Acabado sérico, no deja residuo blanco. Ideal para piel mixta/grasa. Maquillistas lo usan como base antes del makeup porque no interfiere con la cobertura.
- Bioré UV Aqua Rich Watery Essence SPF50+ $475
  → Clásico japonés amado por maquillistas profesionales. Textura de agua, se absorbe al instante. Perfecta bajo maquillaje o como protección diaria ligera.

💆 CUIDADO CAPILAR:
- Mascarilla Shiseido Aqua Intensive $500
  → Marca japonesa de lujo. Hidratación profunda para cabello seco o dañado por tinte y calor. Muy recomendada por estilistas profesionales para recuperar brillo y suavidad.
- &Honey Deep Moist Aceite Capilar $500
  → Superventas en Japón, aroma a miel y sin residuo graso. Perfecto para puntas secas y dar ese brillo tipo "cabello de K-pop".
- CER-100 Hair Filler Ceramide Treatment $395
  → Tratamiento intensivo de ceramidas que rellena la fibra capilar dañada. Popular entre quienes tienen cabello tratado químicamente o con calor constante.

💄 MAQUILLAJE:
- Tirtir Cushion Mask Fit Red (varios tonos) $800
  → El cushion más famoso de K-beauty, tendencia en TikTok. Cobertura media-alta con acabado natural luminoso. Maquillistas coreanos lo usan en tutoriales porque cubre poros sin apelmazar ni verse artificial.
- Mascara Heroine Make Long & Curl $450
  → Ícono del maquillaje japonés. Alarga y riza sin grumos, resistente al agua y sudor todo el día. Favorita de maquillistas para looks naturales y de artista.
- Removedor de Maquillaje Bifásico $450
  → Elimina hasta el maquillaje más resistente, incluyendo waterproof, sin restregar. Imprescindible para proteger la piel al usar productos de larga duración.
- Delineador Waterproof Ultra Fino $450
  → Trazo de precisión, no corre en todo el día. Perfecto para cat eye, delineado coreano o looks de artista.
- Repuesto Rizador de Pestañas $79

🧴 SKIN CARE:
- Mascarilla de Arroz Exfoliante $550
  → El arroz es ingrediente estrella del skincare coreano para piel luminosa y uniforme. Exfolia suavemente y deja la piel radiante.
- Centellian 24 Madeca Cream $579
  → Centella asiática en alta concentración. Calma rojeces, cicatriza y regenera. Dermatólogos y maquillistas la recomiendan para pieles sensibles o con tendencia al acné.
- Dynasty Cream Lifting & Firming $665
  → Efecto tensor y reafirmante visible. Ideal para pieles maduras o quienes quieren prevenir flacidez. Base perfecta antes del maquillaje para que todo luzca mejor.
- Parches de Ojos Beauty of Joseon $620
  → De la marca viral de k-beauty. Desinflamar y descansar el contorno de ojos en 20 minutos. Artistas de maquillaje los usan antes de trabajar para preparar la zona.
- Mixsoon Bean Eye Cream $625
  → Crema de contorno con extracto de soya. Hidratación y luminosidad bajo los ojos. Ideal para quienes tienen ojeras o piel seca en esa área.
- Medicube PDRN Peptide Serum $695
  → Tecnología usada en clínicas de estética de Corea. El PDRN estimula la regeneración celular. Favorito de influencers de skincare para piel más firme y uniforme.
- Medicube Kojic Acid Serum $695
  → Ácido kójico para manchas, hiperpigmentación y tono desigual. Alternativa más suave a tratamientos agresivos. Recomendado para unificar el tono de forma progresiva.
- Set Anua Heartleaf (limpiador + tónico) $720
  → Marca k-beauty explosiva en redes. El tónico Heartleaf es uno de los más compartidos por dermatólogos en TikTok. Calma, hidrata y trata piel con acné o sensibilidad.
- Mixsoon Glass Skin Kit $820
  → Kit completo para lograr el efecto "glass skin" coreano: piel translúcida, hidratada y sin poros visibles. Tendencia popularizada por maquillistas y celebridades de K-pop.

🏥 SALUD:
- Parches para Juanetes Kyusoku Jikan $120

ENVÍOS: Solo Mazatlán por el momento. Envío gratis en pedidos +$800.
MÉTODOS DE PAGO: Transferencia bancaria o Mercado Pago.
DATOS BANCARIOS:
- Banco: STP
- Titular: Maria Guadalupe González Miranda
- Tarjeta: 5319 9500 1011 4248
- CLABE: 646990404045356290

INSTAGRAM: @miyu_beautyj
LANDING: https://miyuuuu.tiiny.site/

FLUJO DE VENTA:
1. Saluda calurosamente y pregunta en qué puedes ayudar.
2. Identifica necesidades: tipo de piel, rutina actual, qué quiere resolver o mejorar.
3. Recomienda productos con descripción real: beneficios, para qué tipo de piel son ideales, y si aplica menciona que los usan maquillistas o que son virales en k-beauty.
4. Ofrece combos o complementos cuando tenga sentido (ej: protector solar + serum, cushion + removedor).
5. Confirma total + método de pago.
6. Pide comprobante de pago para confirmar pedido.
7. Confirma pedido y tiempo de entrega (1-2 días hábiles en Mazatlán).

FORMATO DE RESPUESTA:
- Máximo 3-4 oraciones. Si tienes que dar más información, prioriza lo más útil.
- No uses listas largas si no te las piden. Responde lo que preguntaron.
- Evita repetir lo que ya dijiste antes en la conversación.
- Si vas a dar precio y descripción de un producto, hazlo en 2 líneas, no en un párrafo.

IMPORTANTE:
- Si alguien manda una foto de piel/rostro, analízala brevemente y recomienda 1-2 productos concretos.
- Si mandan comprobante de pago, confírmalo en 1-2 líneas y agradece.
- Si preguntan por algo que no tenemos, dilo directo y sugiere la alternativa más parecida.
- Nunca inventes precios ni productos.
- Si detectas intención de compra fuerte, ofrece el link de pago de Mercado Pago.`;

// ============================================================
// UTILIDADES
// ============================================================

/** fetch con timeout usando AbortController */
async function fetchConTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/** Rate limiting: máx 10 mensajes/minuto por teléfono */
function checkRateLimit(telefono) {
  const ahora = Date.now();
  if (!rateLimiter[telefono]) rateLimiter[telefono] = [];
  rateLimiter[telefono] = rateLimiter[telefono].filter(t => ahora - t < 60000);
  if (rateLimiter[telefono].length >= 10) return false;
  rateLimiter[telefono].push(ahora);
  return true;
}

/** Crear o actualizar perfil de cliente (evita lógica duplicada) */
function actualizarPerfil(telefono) {
  if (!perfilesClientes[telefono]) {
    perfilesClientes[telefono] = {
      telefono,
      primerContacto:  new Date().toISOString(),
      ultimoMensaje:   new Date().toISOString(),
      mensajes:        1,
      esVIP:           false,
      notas:           "",
      etapa:           "nuevo",
    };
  } else {
    perfilesClientes[telefono].ultimoMensaje = new Date().toISOString();
    perfilesClientes[telefono].mensajes++;
  }
}

/** Mantener el historial dentro del límite */
function aplicarLimiteHistorial(telefono, max = 20) {
  if (conversaciones[telefono] && conversaciones[telefono].length > max) {
    conversaciones[telefono] = conversaciones[telefono].slice(-max);
  }
}

// ============================================================
// AUTENTICACIÓN ADMIN
// ============================================================
function adminAuth(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const tokenQuery = req.query.token || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : tokenQuery;

  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "No autorizado" });
  }
  next();
}

// ============================================================
// FUNCIÓN: Enviar mensaje WhatsApp
// ============================================================
async function enviarMensaje(telefono, texto) {
  try {
    const res = await fetchConTimeout(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: telefono,
          type: "text",
          text: { body: texto },
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      const errMsg = data?.error?.message || JSON.stringify(data).slice(0, 300);
      console.error(`Error WA HTTP ${res.status}: ${errMsg}`);
      return { ok: false, error: `[${res.status}] ${errMsg}` };
    }
    return { ok: true, data };
  } catch (err) {
    console.error("Error enviarMensaje:", err.message);
    return { ok: false, error: err.message };
  }
}

// ============================================================
// FUNCIÓN: Subir imagen a WhatsApp Media API
// ============================================================
async function subirMediaWA(buffer, mimeType, filename) {
  try {
    // Usar FormData y Blob nativos de Node.js 18+ (compatibles con fetch nativo)
    const blob = new Blob([buffer], { type: mimeType });
    const fd   = new FormData();
    fd.append("messaging_product", "whatsapp");
    fd.append("file", blob, filename || "photo.jpg");
    // NO poner Content-Type — fetch lo genera solo con el boundary del multipart
    const res = await fetchConTimeout(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
        body: fd,
      },
      30000
    );
    const data = await res.json();
    if (!res.ok) {
      const errMsg = data?.error?.message || JSON.stringify(data).slice(0, 200);
      console.error("subirMediaWA error:", errMsg);
      return { ok: false, error: errMsg };
    }
    console.log("subirMediaWA OK, mediaId:", data.id);
    return { ok: true, mediaId: data.id };
  } catch (err) {
    console.error("subirMediaWA exception:", err.message);
    return { ok: false, error: err.message };
  }
}

// ============================================================
// FUNCIÓN: Enviar imagen por WhatsApp (mediaId o URL pública)
// ============================================================
async function enviarImagen(telefono, { mediaId, url, caption = "" }) {
  try {
    const imageField = mediaId
      ? { id: mediaId, ...(caption ? { caption } : {}) }
      : { link: url, ...(caption ? { caption } : {}) };
    const res = await fetchConTimeout(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: telefono,
          type: "image",
          image: imageField,
        }),
      },
      20000
    );
    const data = await res.json();
    if (!res.ok) {
      const errMsg = data?.error?.message || JSON.stringify(data).slice(0, 200);
      console.error(`Error enviarImagen HTTP ${res.status}: ${errMsg}`);
      return { ok: false, error: errMsg };
    }
    return { ok: true, data };
  } catch (err) {
    console.error("Error enviarImagen:", err.message);
    return { ok: false, error: err.message };
  }
}

// ============================================================
// FUNCIÓN: Delay humanizado + envío en 2 partes
// ============================================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Divide una respuesta larga en 2 partes en el punto más natural */
function partirRespuesta(texto) {
  if (texto.length < 120) return [texto];  // corta → 1 solo mensaje

  // Buscar corte en salto de párrafo
  const porParrafo = texto.indexOf("\n\n");
  if (porParrafo > 60 && porParrafo < texto.length - 60)
    return [texto.slice(0, porParrafo).trim(), texto.slice(porParrafo).trim()];

  // Buscar corte en punto + espacio después de la mitad del primer tercio
  const umbral = Math.floor(texto.length * 0.4);
  const porPunto = texto.indexOf(". ", umbral);
  if (porPunto !== -1 && porPunto < texto.length - 40)
    return [texto.slice(0, porPunto + 1).trim(), texto.slice(porPunto + 2).trim()];

  return [texto];  // no se encontró corte natural
}

/** Envía respuesta del bot con delay humano y en 2 partes si aplica */
async function enviarRespuestaBot(telefono, texto) {
  // Delay inicial: simula que está escribiendo (2-5 segundos según longitud)
  const delayInicial = 2000 + Math.min(texto.length * 15, 3000);
  await sleep(delayInicial);

  const partes = partirRespuesta(texto);
  await enviarMensaje(telefono, partes[0]);

  if (partes[1]) {
    // Pequeña pausa entre mensajes (1-2 s)
    await sleep(1000 + Math.random() * 1000);
    await enviarMensaje(telefono, partes[1]);
  }
}

// ============================================================
// FUNCIÓN: Llamar a Claude API
// ============================================================
async function llamarClaude(telefono, mensajeUsuario) {
  if (!conversaciones[telefono]) conversaciones[telefono] = [];

  conversaciones[telefono].push({
    role: "user",
    content: mensajeUsuario,
    ts: new Date().toISOString(),
  });
  aplicarLimiteHistorial(telefono, 20);

  try {
    const res = await fetchConTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: conversaciones[telefono].map(({ role, content }) => ({ role, content })),
      }),
    }, 40000); // 40 segundos — Claude puede tardar más de 15s

    const data = await res.json();
    if (!res.ok) {
      console.error(`Error Claude HTTP ${res.status}`);
      return "Disculpa, tuve un problema técnico. ¿Puedes repetir tu mensaje? 🙏";
    }

    // Validar estructura de respuesta antes de acceder
    if (
      !data.content ||
      !Array.isArray(data.content) ||
      data.content.length === 0 ||
      typeof data.content[0].text !== "string"
    ) {
      console.error("Respuesta de Claude con formato inesperado:", JSON.stringify(data).slice(0, 200));
      return "Disculpa, tuve un problema técnico. ¿Puedes repetir tu mensaje? 🙏";
    }

    const respuesta = data.content[0].text;
    conversaciones[telefono].push({
      role: "assistant",
      content: respuesta,
      ts: new Date().toISOString(),
    });
    actualizarPerfil(telefono);

    return respuesta;
  } catch (err) {
    console.error("Error llamarClaude:", err.message);
    return "Disculpa, tuve un problema técnico. ¿Puedes repetir tu mensaje? 🙏";
  }
}

// ============================================================
// FUNCIÓN: Transcribir audio con Whisper
// ============================================================
async function transcribirAudio(audioUrl) {
  try {
    const audioRes = await fetchConTimeout(audioUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    const audioBuffer = await audioRes.arrayBuffer();
    const audioBlob   = new Blob([audioBuffer], { type: "audio/ogg" });

    const formData = new FormData();
    formData.append("file", audioBlob, "audio.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "es");

    const whisperRes = await fetchConTimeout(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: formData,
      }
    );

    const whisperData = await whisperRes.json();
    return whisperData.text || null;
  } catch (err) {
    console.error("Error Whisper:", err.message);
    return null;
  }
}

// ============================================================
// LÓGICA DE NEGOCIO: Lead Scoring
// ============================================================
const SEÑALES_COMPRA = [
  { patron:/\bquiero\b/i,           puntos:12 },
  { patron:/\bme\s+interesa\b/i,    puntos:12 },
  { patron:/\blo\s+quiero\b/i,      puntos:15 },
  { patron:/\bcuánto\s+cuesta\b/i,  puntos:10 },
  { patron:/\bprecio\b/i,           puntos:8  },
  { patron:/\bcómo\s+pago\b/i,      puntos:14 },
  { patron:/\bpagar\b/i,            puntos:13 },
  { patron:/\bpedido\b/i,           puntos:10 },
  { patron:/\bcomprar\b/i,          puntos:12 },
  { patron:/\bcuándo\s+llega\b/i,   puntos:10 },
  { patron:/\benvío\b/i,            puntos:8  },
  { patron:/\bdisponible\b/i,       puntos:7  },
  { patron:/\bapartarlo?\b/i,       puntos:14 },
  { patron:/\breservar?\b/i,        puntos:13 },
  { patron:/\bconfirm[ao]\b/i,      puntos:18 },
  { patron:/\btransferencia\b/i,    puntos:15 },
  { patron:/\bcomprobante\b/i,      puntos:18 },
];

const NOMBRES_PRODUCTOS = {
  "beauty of joseon":"beauty-of-joseon-sun", "relief sun":"beauty-of-joseon-sun",
  "bioré":"biore-uv-aqua", "biore":"biore-uv-aqua",
  "shiseido":"shiseido-aqua",
  "honey":"honey-aceite-capilar", "&honey":"honey-aceite-capilar",
  "cer-100":"cer100-hair-filler", "cer100":"cer100-hair-filler",
  "tirtir":"tirtir-cushion", "cushion":"tirtir-cushion",
  "heroine":"heroine-mascara", "mascara":"heroine-mascara",
  "removedor":"removedor-bifasico",
  "delineador":"delineador-waterproof",
  "rizador":"rizador-repuesto",
  "arroz":"mascarilla-arroz",
  "centellian":"centellian-madeca", "madeca":"centellian-madeca",
  "dynasty":"dynasty-cream",
  "parches de ojos":"boj-parches-ojos",
  "bean eye":"mixsoon-bean-eye",
  "pdrn":"medicube-pdrn",
  "kojic":"medicube-kojic",
  "anua":"anua-heartleaf-set", "heartleaf":"anua-heartleaf-set",
  "glass skin":"mixsoon-glass-skin",
  "juanetes":"parches-juanetes",
};

function actualizarLeadScore(telefono, texto) {
  if (!leadScores[telefono]) {
    leadScores[telefono] = { score:0, productos:[], señales:[], ultimaActualizacion: new Date().toISOString() };
  }
  const ld = leadScores[telefono];
  const textoLow = texto.toLowerCase();
  let delta = 0;

  // Señales de compra
  for (const s of SEÑALES_COMPRA) {
    if (s.patron.test(textoLow)) { delta += s.puntos; ld.señales.push(s.patron.source); }
  }

  // Productos mencionados
  for (const [termino, pid] of Object.entries(NOMBRES_PRODUCTOS)) {
    if (textoLow.includes(termino) && !ld.productos.includes(pid)) {
      ld.productos.push(pid);
      delta += 10;
      metricas.productosMencionados[pid] = (metricas.productosMencionados[pid] || 0) + 1;
    }
  }

  if (delta > 0) {
    ld.score = Math.min(100, ld.score + delta);
    ld.ultimaActualizacion = new Date().toISOString();

    // Actualizar etapa del perfil según score
    if (perfilesClientes[telefono]) {
      if (ld.score >= 80)      perfilesClientes[telefono].etapa = "listo";
      else if (ld.score >= 50) perfilesClientes[telefono].etapa = "caliente";
      else if (ld.score >= 20) perfilesClientes[telefono].etapa = "tibio";
    }
  }
}

function labelLeadScore(score) {
  if (score >= 80) return "🔥 Listo para comprar";
  if (score >= 50) return "♨️  Caliente";
  if (score >= 20) return "🌡️  Tibio";
  return "❄️  Frío";
}

// ============================================================
// LÓGICA DE NEGOCIO: Pedidos
// ============================================================
function crearPedido({ telefono, productos, total, metodoPago, notas, direccion }) {
  const id = generarIdPedido();
  pedidos[id] = {
    id,
    telefono,
    productos:         productos || [],
    total:             total || 0,
    estado:            "pendiente",
    metodoPago:        metodoPago || "pendiente",
    notas:             notas || "",
    direccion:         direccion || "",
    comprobante:       null,
    fechaCreacion:     new Date().toISOString(),
    fechaActualizacion:new Date().toISOString(),
    historialEstados:  [{ estado:"pendiente", fecha:new Date().toISOString() }],
  };
  metricas.totalPedidos++;
  metricas.pedidosHoy++;
  metricas.pedidosPorEstado.pendiente++;
  console.log(`📦 Nuevo pedido creado: ${id} para ${telefono}`);
  return pedidos[id];
}

async function actualizarEstadoPedido(pedidoId, nuevoEstado, notas) {
  const p = pedidos[pedidoId];
  if (!p) return { ok:false, error:"Pedido no encontrado" };

  const estadoAnterior = p.estado;
  metricas.pedidosPorEstado[estadoAnterior] = Math.max(0, (metricas.pedidosPorEstado[estadoAnterior]||0) - 1);
  metricas.pedidosPorEstado[nuevoEstado]    = (metricas.pedidosPorEstado[nuevoEstado]||0) + 1;

  p.estado             = nuevoEstado;
  p.fechaActualizacion = new Date().toISOString();
  if (notas) p.notas  += `\n${notas}`;
  p.historialEstados.push({ estado:nuevoEstado, fecha:new Date().toISOString(), notas:notas||"" });

  if (nuevoEstado === "confirmado") {
    metricas.pedidosConfirmados++;
    metricas.ingresoTotal += p.total;
    metricas.ingresoHoy   += p.total;
    // Decrementar stock
    for (const item of p.productos) {
      if (inventario[item.productoId]) {
        inventario[item.productoId].stock    = Math.max(0, inventario[item.productoId].stock - (item.cantidad||1));
        inventario[item.productoId].vendidos += (item.cantidad||1);
      }
    }
  }
  if (nuevoEstado === "cancelado") metricas.pedidosCancelados++;

  // Notificar al cliente por WhatsApp
  const mensajesEstado = {
    confirmado:  `✅ *¡Tu pedido ${pedidoId} está confirmado!* 🎉\n\nEstamos preparando todo con mucho cariño. En cuanto esté listo te avisamos. ¡Gracias por confiar en Miyu Beauty! 🌸`,
    preparando:  `🎀 *Pedido ${pedidoId} en preparación*\n\nEstamos armando tu pedido con todo el amor. Te avisamos cuando esté listo para salir.`,
    enviado:     `🚀 *¡Tu pedido ${pedidoId} ya va en camino!*\n\nEstará contigo en 1-2 días hábiles en Mazatlán. ¡Que lo disfrutes! 💖`,
    entregado:   `🌸 *Pedido ${pedidoId} entregado*\n\n¡Esperamos que ames tus productos! Si tienes cualquier duda, con mucho gusto te ayudamos. ¿Te gustaría dejarnos una reseña? ⭐`,
    cancelado:   `ℹ️ Tu pedido ${pedidoId} fue cancelado. Si fue un error o tienes dudas, escríbenos y lo resolvemos. 🙏`,
  };
  if (mensajesEstado[nuevoEstado] && p.telefono) {
    await enviarMensaje(p.telefono, mensajesEstado[nuevoEstado]);
    if (!conversaciones[p.telefono]) conversaciones[p.telefono] = [];
    conversaciones[p.telefono].push({ role:"assistant", content:`[Sistema]: ${mensajesEstado[nuevoEstado]}`, ts:new Date().toISOString() });
  }

  // Programar seguimiento post-entrega
  if (nuevoEstado === "entregado") programarSeguimiento(p.telefono, "postventa", 72);

  return { ok:true, pedido:p };
}

// ============================================================
// LÓGICA DE NEGOCIO: Seguimientos automáticos
// ============================================================
const TEMPLATES_SEGUIMIENTO = {
  reenganche: `¡Hola! 👋 Te escribimos de Miyu Beauty. Notamos que tenías interés en alguno de nuestros productos ✨ ¿Pudiste encontrar lo que buscabas? Con gusto te ayudamos 🌸`,
  postventa:  `¡Hola! 💖 Esperamos que estés disfrutando tus productos de Miyu Beauty. ¿Cómo te han funcionado? Tu opinión nos ayuda a mejorar 🌟`,
  abandono:   `¡Hola! 🌸 Vimos que estabas interesada en nuestro catálogo. Por tiempo limitado tenemos envío gratis en pedidos desde $800 😊 ¿Te ayudo a elegir?`,
};

function programarSeguimiento(telefono, tipo, horasDelay, mensajeCustom) {
  if (!seguimientosAuto[telefono]) seguimientosAuto[telefono] = [];
  const mensaje = mensajeCustom || TEMPLATES_SEGUIMIENTO[tipo] || TEMPLATES_SEGUIMIENTO.reenganche;
  seguimientosAuto[telefono].push({
    tipo,
    mensaje,
    enviarEn:  Date.now() + horasDelay * 60 * 60 * 1000,
    enviado:   false,
    enviadoEn: null,
    creadoEn:  new Date().toISOString(),
  });
  console.log(`⏰ Seguimiento [${tipo}] programado para ${telefono} en ${horasDelay}h`);
}

function cancelarSeguimientos(telefono) {
  if (seguimientosAuto[telefono]) {
    seguimientosAuto[telefono].forEach(s => { if (!s.enviado) s.enviado = true; });
  }
}

// ============================================================
// LÓGICA DE NEGOCIO: Cotizaciones
// ============================================================
function generarCotizacion(items) {
  // items = [{ productoId, cantidad }]
  let lineas = [];
  let total  = 0;
  for (const item of items) {
    const prod = inventario[item.productoId];
    if (!prod) continue;
    const subtotal = prod.precio * (item.cantidad || 1);
    total += subtotal;
    lineas.push(`• ${prod.nombre} x${item.cantidad||1} — $${subtotal}`);
  }
  const envio = total >= 800 ? "GRATIS 🎉" : "$TBD (solo Mazatlán)";
  return [
    `📋 *Cotización Miyu Beauty*`,
    ``,
    ...lineas,
    ``,
    `💰 *Subtotal: $${total}*`,
    `🚚 Envío: ${envio}`,
    ``,
    `¿Confirmas el pedido? Puedo enviarte el link de pago o los datos bancarios 🌸`,
  ].join("\n");
}

// ============================================================
// WEBHOOK: Verificación Meta
// ============================================================
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============================================================
// WEBHOOK: Recibir mensajes de WhatsApp
// ============================================================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Responder inmediatamente a Meta

  try {
    const body = req.body;
    if (!body?.entry?.[0]?.changes?.[0]?.value?.messages) return;

    const value   = body.entry[0].changes[0].value;
    const mensajes = value.messages;
    if (!Array.isArray(mensajes) || mensajes.length === 0) return;

    const mensaje = mensajes[0];
    // Validar que el teléfono es un string no vacío
    if (!mensaje || typeof mensaje.from !== "string" || !mensaje.from) return;

    const telefono = mensaje.from;
    const tipo     = mensaje.type;

    // Métricas globales
    metricas.mensajesHoy++;
    const esNuevoCliente = !perfilesClientes[telefono];
    if (esNuevoCliente) metricas.totalConversaciones++;

    if (modoPausa[telefono]) {
      // Guardar mensaje del cliente aunque el bot esté pausado, para que aparezca en el dashboard
      if (tipo === "text" && mensaje.text && typeof mensaje.text.body === "string") {
        if (!conversaciones[telefono]) conversaciones[telefono] = [];
        conversaciones[telefono].push({ role:"user", content:mensaje.text.body, ts:new Date().toISOString() });
        // Lead scoring incluso en modo humano
        actualizarLeadScore(telefono, mensaje.text.body);
        // Si respondió → cancelar seguimientos pendientes
        cancelarSeguimientos(telefono);
      }
      return;
    }

    // Rate limiting por teléfono
    if (!checkRateLimit(telefono)) {
      console.warn(`⚠️  Rate limit excedido para ${telefono}`);
      return;
    }

    let textoUsuario = "";

    if (tipo === "text") {
      if (!mensaje.text || typeof mensaje.text.body !== "string") return;
      textoUsuario = mensaje.text.body;
      // Lead scoring y cancelar seguimientos si el cliente respondió
      actualizarLeadScore(telefono, textoUsuario);
      cancelarSeguimientos(telefono);

    } else if (tipo === "image") {
      try {
        if (!mensaje.image || !mensaje.image.id) throw new Error("imagen inválida");
        const imageId  = mensaje.image.id;
        const mediaRes = await fetchConTimeout(
          `https://graph.facebook.com/v18.0/${imageId}`,
          { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
        );
        const mediaData = await mediaRes.json();
        if (!mediaData.url) throw new Error("URL de imagen no disponible");

        const imageDownload = await fetchConTimeout(mediaData.url, {
          headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
        });
        const imageBuffer = await imageDownload.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString("base64");
        const mimeType    = mensaje.image.mime_type || "image/jpeg";

        if (!conversaciones[telefono]) conversaciones[telefono] = [];
        conversaciones[telefono].push({
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: base64Image },
            },
            {
              type: "text",
              text: "Analiza esta imagen. Si es una foto de piel o rostro, recomienda productos. Si es comprobante de pago, confírmalo.",
            },
          ],
          ts: new Date().toISOString(),
        });
        aplicarLimiteHistorial(telefono, 20);

        const res2 = await fetchConTimeout("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-opus-4-6",
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: conversaciones[telefono].map(({ role, content }) => ({ role, content })),
          }),
        });

        const data2 = await res2.json();
        if (
          !data2.content ||
          !Array.isArray(data2.content) ||
          data2.content.length === 0 ||
          typeof data2.content[0].text !== "string"
        ) {
          throw new Error("Respuesta de Claude inválida");
        }
        const respuesta = data2.content[0].text;

        // Reemplazar imagen en historial por placeholder para liberar memoria
        const lastIdx = conversaciones[telefono].length - 1;
        if (Array.isArray(conversaciones[telefono][lastIdx]?.content)) {
          conversaciones[telefono][lastIdx] = {
            role: "user",
            content: "[imagen analizada]",
            ts: conversaciones[telefono][lastIdx].ts,
          };
        }

        conversaciones[telefono].push({
          role: "assistant",
          content: respuesta,
          ts: new Date().toISOString(),
        });
        actualizarPerfil(telefono);

        await enviarRespuestaBot(telefono, respuesta);
        return;
      } catch (imgErr) {
        console.error("Error procesando imagen:", imgErr.message);
        textoUsuario = "[El cliente envió una imagen que no pude procesar]";
      }

    } else if (tipo === "audio") {
      if (OPENAI_API_KEY) {
        try {
          if (!mensaje.audio || !mensaje.audio.id) throw new Error("audio inválido");
          const audioId  = mensaje.audio.id;
          const mediaRes = await fetchConTimeout(
            `https://graph.facebook.com/v18.0/${audioId}`,
            { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
          );
          const mediaData    = await mediaRes.json();
          if (!mediaData.url) throw new Error("URL de audio no disponible");
          const transcripcion = await transcribirAudio(mediaData.url);
          textoUsuario = transcripcion
            ? `[Audio transcrito]: ${transcripcion}`
            : "[El cliente envió un audio que no pude transcribir]";
        } catch (audioErr) {
          console.error("Error audio:", audioErr.message);
          textoUsuario = "[El cliente envió un audio que no pude procesar]";
        }
      } else {
        await enviarMensaje(
          telefono,
          "Hola! 😊 Por el momento no puedo escuchar audios. ¿Puedes escribirme tu mensaje?"
        );
        return;
      }

    } else if (tipo === "sticker") {
      return;
    } else {
      textoUsuario = `[El cliente envió un mensaje de tipo: ${tipo}]`;
    }

    if (!textoUsuario) return;

    // Detectar trolls (normaliza tildes para evitar evasión)
    const palabrasOfensivas = [
      "idiota","estupida","estúpida","tonta","pendeja","puta","mierda",
      "imbecil","imbécil","cabrona","ojete","culera","pinche",
    ];
    const textoNorm = textoUsuario.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const esTroll = palabrasOfensivas.some(p =>
      textoNorm.includes(p.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    );
    if (esTroll) {
      contadorTrolls[telefono] = (contadorTrolls[telefono] || 0) + 1;
      if (contadorTrolls[telefono] >= 3) {
        await enviarMensaje(
          telefono,
          "Lo siento, no puedo continuar esta conversación. Si necesitas ayuda, escríbenos con respeto. 🙏"
        );
        modoPausa[telefono] = true;
        return;
      }
      await enviarMensaje(
        telefono,
        "Hola, me gustaría poder ayudarte mejor. ¿Puedo hacer algo por ti? 😊"
      );
      return;
    }

    const respuesta = await llamarClaude(telefono, textoUsuario);
    await enviarRespuestaBot(telefono, respuesta);

  } catch (err) {
    console.error("Error en webhook:", err.message);
  }
});

// ============================================================
// DASHBOARD HTML INCRUSTADO
// ============================================================
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0a0809">
<title>MIYU Beauty — Centro de Operaciones</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet">
<style>
/* ─────────────────────────────────────────
   TOKENS
───────────────────────────────────────── */
:root {
  --c-base:    #0a0809;
  --c-surface: #111019;
  --c-raised:  #19181f;
  --c-overlay: #222030;
  --c-rim:     rgba(255,255,255,.055);
  --c-rim2:    rgba(255,255,255,.09);

  --c-gold:    #c8ab6e;
  --c-gold-lt: #e2cc97;
  --c-gold-dk: #8a6f3a;
  --c-gold-glow: rgba(200,171,110,.18);
  --c-blush:   #c97d8e;
  --c-blush-lt: #e8a0b3;
  --c-blush-glow: rgba(201,125,142,.14);
  --c-mint:    #6daa8e;
  --c-mint-glow: rgba(109,170,142,.14);

  --c-text:    #ede8e0;
  --c-text2:   #9a928a;
  --c-text3:   #524d4a;

  --r-sm: 8px;
  --r-md: 12px;
  --r-lg: 16px;

  --nav-w: 68px;
  --side-w: 308px;
  --rp-w: 272px;

  --transition: all .18s cubic-bezier(.4,0,.2,1);
}

*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
html, body { height:100%; overflow:hidden; background:var(--c-base); }
body { font-family:'DM Sans', sans-serif; color:var(--c-text); cursor:default; }
::selection { background:var(--c-gold-glow); }

/* scrollbar */
::-webkit-scrollbar { width:3px; height:3px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:var(--c-overlay); border-radius:2px; }

/* ─────────────────────────────────────────
   AUTH OVERLAY
───────────────────────────────────────── */
#auth-overlay {
  position:fixed; inset:0; z-index:9999;
  background:var(--c-base);
  display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:14px;
}
.auth-logo {
  font-family:'Playfair Display',serif; font-style:italic;
  font-size:28px; color:var(--c-gold); letter-spacing:.12em; margin-bottom:8px;
}
.auth-sub { font-size:11px; color:var(--c-text3); letter-spacing:.15em; text-transform:uppercase; margin-bottom:12px; }
#token-input {
  width:280px; background:var(--c-raised);
  border:1px solid var(--c-rim2); border-radius:var(--r-sm);
  padding:10px 14px; color:var(--c-text);
  font-family:'DM Sans',sans-serif; font-size:13px; outline:none;
  transition:border-color .18s;
}
#token-input:focus { border-color:rgba(200,171,110,.4); }
#auth-btn {
  width:280px; background:var(--c-gold); color:var(--c-base);
  border:none; border-radius:var(--r-sm);
  padding:10px 24px; font-size:13px; font-weight:500;
  cursor:pointer; font-family:'DM Sans',sans-serif; transition:var(--transition);
}
#auth-btn:hover { background:var(--c-gold-lt); }
#auth-error { color:var(--c-blush-lt); font-size:11.5px; display:none; }

/* ─────────────────────────────────────────
   LAYOUT SHELL
───────────────────────────────────────── */
.shell { display:flex; height:100vh; }

/* ─────────────────────────────────────────
   ICON-NAV (left strip)
───────────────────────────────────────── */
.nav {
  width:var(--nav-w); flex-shrink:0;
  background:var(--c-surface);
  border-right:1px solid var(--c-rim);
  display:flex; flex-direction:column;
  align-items:center; padding:22px 0 20px;
  gap:2px; z-index:20;
}
.nav-logo {
  font-family:'Playfair Display', serif;
  font-style:italic; font-size:13px;
  letter-spacing:.12em; color:var(--c-gold);
  margin-bottom:28px;
  writing-mode:vertical-rl; transform:rotate(180deg);
  line-height:1;
}
.nav-btn {
  width:42px; height:42px; border-radius:var(--r-sm);
  display:flex; align-items:center; justify-content:center;
  font-size:17px; cursor:pointer;
  color:var(--c-text3); transition:var(--transition);
  position:relative; user-select:none;
}
.nav-btn:hover { background:var(--c-raised); color:var(--c-text2); }
.nav-btn.on { background:var(--c-gold-glow); color:var(--c-gold); }
.nav-btn.on::after {
  content:'';
  position:absolute; right:0; top:50%; transform:translateY(-50%);
  width:2px; height:18px;
  background:var(--c-gold); border-radius:1px 0 0 1px;
}
.nav-spacer { flex:1; }
.nav-avatar {
  width:34px; height:34px; border-radius:50%;
  background:linear-gradient(135deg, var(--c-gold), var(--c-blush));
  display:flex; align-items:center; justify-content:center;
  font-family:'Playfair Display', serif; font-size:14px;
  color:var(--c-base); cursor:pointer;
  transition:var(--transition);
}
.nav-avatar:hover { transform:scale(1.06); }

/* ─────────────────────────────────────────
   VIEWS WRAPPER
───────────────────────────────────────── */
.views { flex:1; display:flex; overflow:hidden; min-width:0; }
.view { display:none; flex:1; min-width:0; overflow:hidden; }
.view.on { display:flex; }

/* ─────────────────────────────────────────
   SIDEBAR (chat list)
───────────────────────────────────────── */
.sidebar {
  width:var(--side-w); flex-shrink:0;
  background:var(--c-surface);
  border-right:1px solid var(--c-rim);
  display:flex; flex-direction:column;
  overflow:hidden;
}
.sb-head {
  padding:18px 18px 14px;
  border-bottom:1px solid var(--c-rim);
  flex-shrink:0;
}
.sb-eyebrow {
  font-size:9px; letter-spacing:.22em;
  text-transform:uppercase; color:var(--c-text3);
  font-family:'DM Mono', monospace;
  margin-bottom:12px;
}
.sb-search {
  width:100%; background:var(--c-raised);
  border:1px solid var(--c-rim); border-radius:var(--r-sm);
  padding:8px 12px; color:var(--c-text);
  font-family:'DM Sans', sans-serif; font-size:12px;
  outline:none; transition:var(--transition);
}
.sb-search:focus { border-color:rgba(200,171,110,.4); }
.sb-search::placeholder { color:var(--c-text3); }
.sb-filters { display:flex; gap:5px; margin-top:10px; flex-wrap:wrap; }
.chip {
  padding:3px 10px; border-radius:100px;
  font-size:10px; font-family:'DM Mono',monospace;
  letter-spacing:.05em; cursor:pointer;
  border:1px solid var(--c-rim2); color:var(--c-text3);
  background:transparent; transition:var(--transition);
}
.chip.on {
  background:var(--c-gold-glow);
  border-color:rgba(200,171,110,.3); color:var(--c-gold);
}

.chat-list { flex:1; overflow-y:auto; }

.chat-row {
  padding:13px 18px; cursor:pointer;
  border-bottom:1px solid var(--c-rim);
  transition:background .12s; position:relative;
  animation:rowIn .22s ease both;
}
@keyframes rowIn { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:none} }
.chat-row:hover { background:var(--c-raised); }
.chat-row.sel { background:var(--c-raised); }
.chat-row.sel::before {
  content:''; position:absolute; left:0; top:4px; bottom:4px;
  width:2px; border-radius:0 1px 1px 0;
  background:var(--c-gold);
}
.chat-row.paused::before { background:var(--c-blush); }

.cr-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
.cr-name { font-size:13px; font-weight:500; color:var(--c-text); }
.cr-time { font-size:10px; color:var(--c-text3); font-family:'DM Mono',monospace; }
.cr-preview {
  font-size:11.5px; color:var(--c-text2); line-height:1.4;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  max-width:240px; margin-bottom:6px;
}
.cr-tags { display:flex; gap:4px; }
.tag {
  padding:2px 7px; border-radius:100px;
  font-size:9px; font-weight:500;
  letter-spacing:.08em; text-transform:uppercase;
  font-family:'DM Mono',monospace;
}
.tag-bot   { background:var(--c-gold-glow);  color:var(--c-gold); }
.tag-human { background:var(--c-blush-glow); color:var(--c-blush-lt); }
.tag-nuevo { background:var(--c-mint-glow);  color:var(--c-mint); }
.tag-frec  { background:rgba(100,140,210,.1); color:#88aadd; }
.tag-vip   { background:rgba(200,171,110,.2); color:var(--c-gold-lt);
             border:1px solid rgba(200,171,110,.25); }
.unread {
  position:absolute; right:18px; top:50%; transform:translateY(-50%);
  width:6px; height:6px; border-radius:50%;
  background:var(--c-gold); box-shadow:0 0 7px var(--c-gold);
}

/* ─────────────────────────────────────────
   CENTER PANEL
───────────────────────────────────────── */
.center { flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden; }

.topbar {
  height:58px; flex-shrink:0;
  padding:0 22px;
  border-bottom:1px solid var(--c-rim);
  background:var(--c-surface);
  display:flex; align-items:center; justify-content:space-between;
}
.tb-left { display:flex; align-items:center; gap:14px; }
.tb-av {
  width:36px; height:36px; border-radius:50%;
  background:linear-gradient(135deg, var(--c-gold), var(--c-blush));
  display:flex; align-items:center; justify-content:center;
  font-family:'Playfair Display',serif; font-size:15px; color:var(--c-base);
  flex-shrink:0;
}
.tb-name { font-size:13px; font-weight:500; }
.tb-phone { font-size:10px; color:var(--c-text3); font-family:'DM Mono',monospace; margin-top:1px; }
.tb-right { display:flex; gap:8px; align-items:center; }

/* Buttons */
.btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:7px 15px; border-radius:var(--r-sm);
  font-size:11.5px; font-weight:500; cursor:pointer;
  border:none; font-family:'DM Sans',sans-serif;
  transition:var(--transition); white-space:nowrap; letter-spacing:.01em;
}
.btn:active { transform:scale(.97); }
.btn:disabled { opacity:.3; cursor:default; transform:none !important; }

.btn-gold   { background:var(--c-gold); color:var(--c-base); }
.btn-gold:hover { background:var(--c-gold-lt); }
.btn-blush  { background:var(--c-blush); color:#fff; }
.btn-blush:hover { filter:brightness(1.1); }
.btn-mint   { background:var(--c-mint); color:var(--c-base); }
.btn-mint:hover { filter:brightness(1.1); }
.btn-rim    {
  background:transparent; color:var(--c-text2);
  border:1px solid var(--c-rim2);
}
.btn-rim:hover { border-color:rgba(200,171,110,.35); color:var(--c-gold); }
.btn-pay    {
  background:rgba(30,160,250,.1); color:#5bc5fa;
  border:1px solid rgba(30,160,250,.18);
}
.btn-pay:hover { background:rgba(30,160,250,.18); }

/* Messages */
.msgs-wrap { flex:1; overflow-y:auto; padding:24px 22px; display:flex; flex-direction:column; gap:13px; }
.msg { max-width:66%; }
.msg.bot, .msg.agent { align-self:flex-start; }
.msg.user { align-self:flex-end; }
.msg-who {
  font-size:9.5px; letter-spacing:.12em; text-transform:uppercase;
  color:var(--c-text3); margin-bottom:4px;
  font-family:'DM Mono',monospace;
}
.msg.bot   .msg-who { color:var(--c-gold); }
.msg.agent .msg-who { color:var(--c-blush-lt); }
.bubble {
  padding:10px 14px; border-radius:var(--r-md);
  font-size:13px; line-height:1.62; white-space:pre-wrap;
}
.msg.bot   .bubble { background:var(--c-raised); border:1px solid var(--c-rim2); border-bottom-left-radius:3px; }
.msg.user  .bubble { background:rgba(200,171,110,.09); border:1px solid rgba(200,171,110,.14); border-bottom-right-radius:3px; }
.msg.agent .bubble { background:var(--c-blush-glow); border:1px solid rgba(201,125,142,.18); border-bottom-left-radius:3px; }
.msg-ts { font-size:9.5px; color:var(--c-text3); margin-top:4px; font-family:'DM Mono',monospace; }
.msg.user .msg-ts { text-align:right; }

/* Input bar */
.ibar {
  padding:14px 18px; flex-shrink:0;
  border-top:1px solid var(--c-rim);
  background:var(--c-surface);
}
.ibar-mode {
  display:flex; align-items:center; gap:7px;
  font-size:10.5px; color:var(--c-text3); margin-bottom:9px;
}
.pip { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
.pip-bot   { background:var(--c-gold); box-shadow:0 0 5px var(--c-gold); }
.pip-human { background:var(--c-blush); box-shadow:0 0 5px var(--c-blush); animation:pipPulse 1.8s infinite; }
@keyframes pipPulse { 0%,100%{opacity:1}50%{opacity:.4} }
.ibar-row { display:flex; gap:9px; align-items:flex-end; }
.ibar-input {
  flex:1; background:var(--c-raised); border:1px solid var(--c-rim2);
  border-radius:var(--r-sm); padding:9px 13px;
  color:var(--c-text); font-family:'DM Sans',sans-serif; font-size:13px;
  resize:none; min-height:40px; max-height:96px;
  outline:none; transition:var(--transition); line-height:1.5;
}
.ibar-input:focus { border-color:rgba(200,171,110,.4); }
.ibar-input::placeholder { color:var(--c-text3); }
.ibar-send {
  width:40px; height:40px; border-radius:var(--r-sm);
  background:var(--c-gold); border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  font-size:15px; color:var(--c-base);
  transition:var(--transition); flex-shrink:0;
}
.ibar-send:hover { background:var(--c-gold-lt); transform:scale(1.05); }
.ibar-send:disabled { opacity:.3; cursor:default; transform:none; }
.ibar-img-btn {
  display:flex; align-items:center; justify-content:center;
  width:36px; height:36px; border-radius:50%; font-size:16px;
  background:var(--c-raised); border:1px solid var(--c-rim);
  flex-shrink:0; transition:background .15s, transform .1s;
  user-select:none;
}
.ibar-img-btn:not(.disabled):hover { background:var(--c-overlay); transform:scale(1.08); }

/* Empty state */
.empty {
  flex:1; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  gap:14px; color:var(--c-text3); text-align:center; padding:48px;
}
.empty-m {
  font-family:'Playfair Display',serif; font-style:italic;
  font-size:80px; color:rgba(200,171,110,.06); line-height:1;
  animation:fadeUp .6s ease both;
}
.empty-t {
  font-family:'Playfair Display',serif; font-weight:400;
  font-size:18px; color:var(--c-text3);
  animation:fadeUp .6s .1s ease both;
}
.empty-s {
  font-size:12px; color:var(--c-text3); max-width:220px;
  line-height:1.7; animation:fadeUp .6s .2s ease both;
}
@keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }

/* ─────────────────────────────────────────
   RIGHT PANEL
───────────────────────────────────────── */
.rp {
  width:var(--rp-w); flex-shrink:0;
  background:var(--c-surface); border-left:1px solid var(--c-rim);
  display:flex; flex-direction:column; overflow:hidden;
}
.rp-tabs {
  display:flex; border-bottom:1px solid var(--c-rim);
  flex-shrink:0;
}
.rp-tab {
  flex:1; padding:13px 6px; text-align:center;
  font-size:9.5px; letter-spacing:.12em; text-transform:uppercase;
  font-family:'DM Mono',monospace; color:var(--c-text3);
  cursor:pointer; border-bottom:2px solid transparent;
  transition:var(--transition);
}
.rp-tab.on { color:var(--c-gold); border-bottom-color:var(--c-gold); }
.rp-body { flex:1; overflow-y:auto; padding:18px; }

.rp-section { margin-bottom:22px; }
.rp-title {
  font-family:'DM Mono',monospace; font-size:9px;
  letter-spacing:.2em; text-transform:uppercase;
  color:var(--c-text3); padding-bottom:8px;
  border-bottom:1px solid var(--c-rim); margin-bottom:11px;
}
.kv { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:7px; }
.kk { font-size:11.5px; color:var(--c-text3); }
.vv { font-size:11.5px; color:var(--c-text); font-weight:500; text-align:right; max-width:140px; }
.vv-gold  { color:var(--c-gold); }
.vv-blush { color:var(--c-blush-lt); }
.vv-mint  { color:var(--c-mint); }

/* Mini sparkline */
.spark { width:100%; height:32px; display:block; }

/* Stock mini */
.stock-row {
  display:flex; justify-content:space-between; align-items:center;
  padding:6px 0; border-bottom:1px solid var(--c-rim); font-size:11.5px;
}
.stock-row:last-child { border:none; }
.sn { color:var(--c-text2); max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sq { font-family:'DM Mono',monospace; font-size:11px; }
.ok { color:var(--c-mint); } .low { color:var(--c-gold); } .out { color:var(--c-blush-lt); }

/* Actions list */
.action-btn {
  width:100%; margin-bottom:7px; justify-content:flex-start;
  padding:9px 13px; border-radius:var(--r-sm);
  background:var(--c-raised); border:1px solid var(--c-rim);
  font-size:12px; color:var(--c-text2);
  cursor:pointer; display:flex; align-items:center; gap:9px;
  transition:var(--transition); font-family:'DM Sans',sans-serif; font-weight:400;
}
.action-btn:hover { border-color:rgba(200,171,110,.3); color:var(--c-gold); background:var(--c-gold-glow); }
.action-btn.danger:hover { border-color:rgba(201,125,142,.3); color:var(--c-blush-lt); background:var(--c-blush-glow); }
.note-input {
  width:100%; background:var(--c-raised); border:1px solid var(--c-rim);
  border-radius:var(--r-sm); padding:9px 12px;
  color:var(--c-text); font-family:'DM Sans',sans-serif; font-size:12px;
  resize:none; min-height:72px; outline:none;
  transition:var(--transition); margin-bottom:8px;
}
.note-input:focus { border-color:rgba(200,171,110,.35); }
.note-input::placeholder { color:var(--c-text3); }

/* ─────────────────────────────────────────
   ANALYTICS VIEW
───────────────────────────────────────── */
.an-view { flex:1; display:flex; flex-direction:column; overflow:hidden; }

.stats-strip {
  display:flex; border-bottom:1px solid var(--c-rim);
  background:var(--c-surface); flex-shrink:0;
}
.stat-tile {
  flex:1; padding:16px 20px;
  border-right:1px solid var(--c-rim);
  position:relative; overflow:hidden;
}
.stat-tile:last-child { border-right:none; }
.stat-tile::before {
  content:''; position:absolute; inset:0;
  background:var(--c-gold-glow); opacity:0;
  transition:opacity .2s;
}
.stat-tile:hover::before { opacity:1; }
.st-n {
  font-family:'Playfair Display',serif; font-size:30px; font-weight:400;
  color:var(--c-gold); line-height:1; position:relative;
}
.st-l { font-size:9.5px; color:var(--c-text3); text-transform:uppercase; letter-spacing:.15em; margin-top:4px; font-family:'DM Mono',monospace; }
.st-d { font-size:11px; color:var(--c-mint); margin-top:3px; }

.an-body { flex:1; overflow-y:auto; padding:26px; }

.an-h1 {
  font-family:'Playfair Display',serif; font-size:22px; font-weight:400;
  color:var(--c-text); margin-bottom:4px;
}
.an-sub { font-size:11.5px; color:var(--c-text3); margin-bottom:26px; }

.an-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.an-card {
  background:var(--c-surface); border:1px solid var(--c-rim);
  border-radius:var(--r-lg); padding:20px;
  transition:border-color .2s;
}
.an-card:hover { border-color:var(--c-rim2); }
.an-card.full { grid-column:1/-1; }
.an-card-t {
  font-family:'DM Mono',monospace; font-size:9px;
  letter-spacing:.2em; text-transform:uppercase;
  color:var(--c-text3); margin-bottom:16px;
  display:flex; justify-content:space-between; align-items:center;
}
.an-card-t span { color:var(--c-gold); font-size:13px; font-family:'Playfair Display',serif; }

.bar-chart {
  display:flex; gap:5px; align-items:flex-end;
  height:100px; position:relative;
}
.bc-wrap { flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; }
.bc-bar {
  width:100%; border-radius:3px 3px 0 0;
  background:var(--c-overlay); position:relative;
  cursor:pointer; transition:filter .15s;
  min-height:3px;
}
.bc-bar.hi { background:linear-gradient(to top, var(--c-gold-dk), var(--c-gold)); }
.bc-bar.lo { background:var(--c-raised); }
.bc-bar:hover { filter:brightness(1.3); }
.bc-bar-tip {
  position:absolute; top:-22px; left:50%;
  transform:translateX(-50%);
  background:var(--c-overlay); color:var(--c-gold-lt);
  font-size:9px; padding:2px 6px; border-radius:4px;
  white-space:nowrap; opacity:0; transition:.15s; pointer-events:none;
  font-family:'DM Mono',monospace;
}
.bc-bar:hover .bc-bar-tip { opacity:1; }
.bc-lbl { font-size:9px; color:var(--c-text3); font-family:'DM Mono',monospace; }

.donut-wrap { display:flex; align-items:center; gap:18px; }
.donut-legend { display:flex; flex-direction:column; gap:8px; flex:1; }
.dl { display:flex; align-items:center; gap:8px; }
.dl-dot { width:8px; height:8px; border-radius:2px; flex-shrink:0; }
.dl-name { font-size:11.5px; color:var(--c-text2); flex:1; }
.dl-val { font-size:11.5px; color:var(--c-gold); font-weight:500; font-family:'DM Mono',monospace; }

.funnel { display:flex; flex-direction:column; gap:7px; }
.fn { display:flex; align-items:center; gap:10px; }
.fn-lbl { font-size:11px; color:var(--c-text3); width:120px; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.fn-track { flex:1; height:24px; background:var(--c-overlay); border-radius:4px; overflow:hidden; }
.fn-fill {
  height:100%; border-radius:4px;
  display:flex; align-items:center; padding-left:10px;
  font-size:10px; font-weight:600; color:var(--c-base);
  font-family:'DM Mono',monospace;
  transition:width .9s cubic-bezier(.4,0,.2,1);
}
.fn-n { font-size:11px; color:var(--c-text3); width:28px; text-align:right; font-family:'DM Mono',monospace; }

.hourly-chart { display:flex; gap:4px; align-items:flex-end; height:70px; padding-bottom:18px; }
.hc-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; }
.hc-bar {
  width:100%; border-radius:2px 2px 0 0; min-height:2px;
  background:var(--c-overlay); transition:background .2s;
  cursor:pointer;
}
.hc-bar.busy { background:linear-gradient(to top, var(--c-gold-dk), var(--c-gold)); }
.hc-bar.medium { background:rgba(200,171,110,.3); }
.hc-lbl { font-size:8px; color:var(--c-text3); font-family:'DM Mono',monospace; }

.ptable { width:100%; border-collapse:collapse; }
.ptable th { font-family:'DM Mono',monospace; font-size:9px; letter-spacing:.15em; text-transform:uppercase; color:var(--c-text3); text-align:left; padding:6px 0; border-bottom:1px solid var(--c-rim); }
.ptable td { font-size:12px; color:var(--c-text2); padding:9px 0; border-bottom:1px solid var(--c-rim); }
.ptable td:last-child { color:var(--c-gold); text-align:right; font-family:'DM Mono',monospace; }
.ptable tr:last-child td { border:none; }
.pt-rank { color:var(--c-text3) !important; width:20px; font-family:'DM Mono',monospace; }

/* ─────────────────────────────────────────
   INVENTORY VIEW
───────────────────────────────────────── */
.inv-view { flex:1; display:flex; flex-direction:column; overflow:hidden; }
.inv-body { flex:1; overflow-y:auto; padding:26px; }
.inv-table { width:100%; border-collapse:collapse; }
.inv-table th {
  font-family:'DM Mono',monospace; font-size:9px;
  letter-spacing:.18em; text-transform:uppercase; color:var(--c-text3);
  text-align:left; padding:8px 0; border-bottom:1px solid var(--c-rim);
  position:sticky; top:0; background:var(--c-base);
}
.inv-table td { font-size:12px; color:var(--c-text2); padding:10px 0; border-bottom:1px solid var(--c-rim); }
.inv-table tr:hover td { color:var(--c-text); }
.inv-table td:nth-child(3) { font-family:'DM Mono',monospace; color:var(--c-gold); }
.inv-table td:last-child { text-align:right; }
.sku { color:var(--c-text3) !important; font-family:'DM Mono',monospace; font-size:10.5px; }
.qty-ok  { color:var(--c-mint) !important; }
.qty-low { color:var(--c-gold) !important; }
.qty-out { color:var(--c-blush-lt) !important; }

/* ─────────────────────────────────────────
   LEAD SCORE BADGE
───────────────────────────────────────── */
.lead-badge {
  font-size:9px; font-family:'DM Mono',monospace;
  padding:2px 6px; border-radius:100px; margin-left:3px;
}
.lead-frio    { background:rgba(100,130,180,.12); color:#7799cc; }
.lead-tibio   { background:rgba(200,160,80,.14);  color:#c8a04e; }
.lead-caliente{ background:rgba(200,100,80,.15);  color:#e07060; }
.lead-listo   { background:rgba(200,80,80,.2);    color:#e05050;
                box-shadow:0 0 6px rgba(200,80,80,.3); }

/* ─────────────────────────────────────────
   PEDIDOS VIEW
───────────────────────────────────────── */
.ped-view  { flex:1; display:flex; flex-direction:column; overflow:hidden; }
.ped-body  { flex:1; overflow-y:auto; padding:26px; }
.ped-table { width:100%; border-collapse:collapse; }
.ped-table th {
  font-family:'DM Mono',monospace; font-size:9px;
  letter-spacing:.18em; text-transform:uppercase; color:var(--c-text3);
  text-align:left; padding:8px 4px; border-bottom:1px solid var(--c-rim);
  position:sticky; top:0; background:var(--c-base);
}
.ped-table td { font-size:11.5px; color:var(--c-text2); padding:9px 4px; border-bottom:1px solid var(--c-rim); vertical-align:middle; }
.ped-table tr:hover td { color:var(--c-text); background:var(--c-raised); }
.ped-id   { font-family:'DM Mono',monospace; font-size:10px; color:var(--c-gold); }
.ped-total{ font-family:'DM Mono',monospace; color:var(--c-mint); }
.status-badge {
  display:inline-block; padding:3px 8px; border-radius:100px;
  font-size:9px; font-family:'DM Mono',monospace; letter-spacing:.05em;
}
.s-pendiente  { background:rgba(200,160,80,.15);  color:#c8a04e; }
.s-confirmado { background:rgba(109,170,142,.15);  color:var(--c-mint); }
.s-preparando { background:rgba(100,140,220,.13);  color:#88aaee; }
.s-enviado    { background:rgba(150,100,220,.13);  color:#bb88ee; }
.s-entregado  { background:rgba(109,170,142,.25);  color:var(--c-mint); border:1px solid rgba(109,170,142,.3); }
.s-cancelado  { background:rgba(201,125,142,.12);  color:var(--c-blush-lt); }
.ped-filters  { display:flex; gap:6px; margin-bottom:18px; flex-wrap:wrap; }

/* Inventario editable */
.qty-edit {
  background:var(--c-raised); border:1px solid var(--c-rim2);
  border-radius:4px; padding:3px 7px; width:60px;
  color:var(--c-text); font-family:'DM Mono',monospace; font-size:11px;
  text-align:center; outline:none;
}
.qty-edit:focus { border-color:rgba(200,171,110,.5); }
.save-qty {
  background:var(--c-gold); color:var(--c-base); border:none;
  border-radius:4px; padding:3px 8px; font-size:10px; cursor:pointer;
  font-family:'DM Sans',sans-serif; transition:var(--transition); margin-left:4px;
}
.save-qty:hover { background:var(--c-gold-lt); }

/* Cotizador */
.cot-row  { display:flex; gap:6px; margin-bottom:7px; align-items:center; }
.cot-sel  { flex:1; background:var(--c-raised); border:1px solid var(--c-rim2); border-radius:4px; padding:6px 8px; color:var(--c-text); font-size:11px; outline:none; }
.cot-sel:focus { border-color:rgba(200,171,110,.4); }
.cot-qty  { width:44px; background:var(--c-raised); border:1px solid var(--c-rim2); border-radius:4px; padding:6px; color:var(--c-text); font-size:11px; text-align:center; outline:none; }
.cot-del  { background:transparent; border:none; color:var(--c-blush-lt); cursor:pointer; font-size:14px; padding:0 4px; }
.cot-total{ font-family:'DM Mono',monospace; font-size:13px; color:var(--c-gold); text-align:right; margin:8px 0; }

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
.toast {
  position:fixed; bottom:22px; right:22px; z-index:999;
  padding:11px 18px; border-radius:var(--r-md);
  font-size:12.5px; font-weight:500; display:flex; align-items:center; gap:8px;
  backdrop-filter:blur(12px);
  animation:tIn .25s ease, tOut .3s 2.7s ease forwards;
  box-shadow:0 8px 32px rgba(0,0,0,.4);
}
.t-gold  { background:rgba(200,171,110,.92); color:var(--c-base); }
.t-blush { background:rgba(201,125,142,.92); color:#fff; }
.t-mint  { background:rgba(109,170,142,.92); color:var(--c-base); }
@keyframes tIn  { from{transform:translateX(50px);opacity:0} to{transform:none;opacity:1} }
@keyframes tOut { to{transform:translateX(50px);opacity:0} }

/* Back button — hidden on desktop, shown on mobile */
.tb-back {
  display:none; width:36px; height:36px; flex-shrink:0;
  align-items:center; justify-content:center;
  border-radius:var(--r-sm); background:var(--c-raised);
  border:1px solid var(--c-rim); color:var(--c-text2);
  cursor:pointer; font-size:20px; line-height:1;
  transition:var(--transition);
}
.tb-back:hover { color:var(--c-gold); border-color:rgba(200,171,110,.35); }

/* ═══════════════════════════════════════════════
   RESPONSIVE — Tablet (≤ 900px)
═══════════════════════════════════════════════ */
@media (max-width: 900px) {
  :root { --rp-w: 240px; --side-w: 270px; }
}

/* ═══════════════════════════════════════════════
   RESPONSIVE — Mobile (≤ 768px)
   iPhone 16 Pro Max = 430 × 932 logical px
═══════════════════════════════════════════════ */
@media (max-width: 768px) {
  :root { --nav-w: 0px; }

  html, body { overflow:hidden; -webkit-text-size-adjust:100%; }
  * { -webkit-tap-highlight-color:transparent; }

  /* ── Bottom nav bar ── */
  .nav {
    position:fixed; bottom:0; left:0; right:0; top:auto;
    width:100%; height:calc(56px + env(safe-area-inset-bottom));
    padding:0 4px env(safe-area-inset-bottom);
    flex-direction:row; border-right:none;
    border-top:1px solid var(--c-rim);
    z-index:100; justify-content:space-around; align-items:center;
  }
  .nav-logo, .nav-spacer { display:none; }
  .nav-btn { width:50px; height:50px; font-size:21px; border-radius:var(--r-md); }
  .nav-btn.on::after {
    right:auto; top:2px; left:50%; transform:translateX(-50%);
    width:22px; height:2px; border-radius:0 0 2px 2px;
  }
  .nav-avatar { width:34px; height:34px; font-size:13px; }

  /* ── Shell ── */
  .shell { height:calc(100dvh - 56px - env(safe-area-inset-bottom)); flex-direction:column; }
  .views { flex:1; height:100%; min-height:0; }

  /* ── Chat view: sliding panels ── */
  #view-chats { position:relative; overflow:hidden; }
  .sidebar {
    position:absolute; inset:0; width:100%; z-index:10;
    transition:transform .28s cubic-bezier(.4,0,.2,1);
  }
  .center {
    position:absolute; inset:0; width:100%; z-index:9;
    background:var(--c-base); transform:translateX(100%);
    transition:transform .28s cubic-bezier(.4,0,.2,1);
  }
  #view-chats.chat-open .sidebar { transform:translateX(-100%); }
  #view-chats.chat-open .center  { transform:translateX(0); }

  /* ── Right panel: bottom sheet ── */
  .rp {
    display:flex !important; flex-direction:column !important;
    position:fixed;
    bottom:calc(56px + env(safe-area-inset-bottom));
    left:0; right:0; height:72vh; width:100%;
    z-index:80; border-left:none;
    border-top:1px solid var(--c-rim2);
    border-radius:18px 18px 0 0;
    transform:translateY(110%);
    transition:transform .32s cubic-bezier(.4,0,.2,1);
    box-shadow:0 -12px 48px rgba(0,0,0,.6);
  }
  .rp.open { transform:translateY(0); }
  .rp-handle {
    width:36px; height:4px; border-radius:2px;
    background:var(--c-overlay); margin:10px auto 0; flex-shrink:0;
  }

  /* ── RP Backdrop ── */
  .rp-backdrop {
    display:none; position:fixed; inset:0; z-index:79;
    background:rgba(0,0,0,.45);
    -webkit-backdrop-filter:blur(3px);
    backdrop-filter:blur(3px);
  }
  .rp-backdrop.on { display:block; }

  /* ── Topbar ── */
  .tb-back { display:flex !important; }
  .topbar { padding:0 10px; height:52px; }
  .tb-left { gap:8px; }
  .tb-right { gap:5px; }
  .tb-right .btn-rim  { display:none; }
  .tb-right .btn-pay  { display:none; }
  .btn { padding:6px 10px; font-size:10.5px; }
  .tb-av { width:32px; height:32px; font-size:13px; }
  .tb-name { font-size:12.5px; }
  .tb-phone { display:none; }

  /* ── Messages ── */
  .msgs-wrap { padding:14px 12px; gap:10px; }
  .msg { max-width:86%; }
  .bubble { font-size:13.5px; padding:9px 13px; }

  /* ── Input bar ── */
  .ibar { padding:10px 12px; padding-bottom:calc(10px + env(safe-area-inset-bottom)); }
  .ibar-input {
    font-size:16px !important; /* previene zoom en iOS */
    min-height:44px;
  }
  .ibar-send  { width:44px; height:44px; font-size:17px; }
  .ibar-img-btn { width:44px; height:44px; font-size:18px; }

  /* ── Chat list ── */
  .sb-head { padding:14px 14px 10px; }
  .sb-search { font-size:16px !important; /* previene zoom en iOS */ }
  .chat-row { padding:14px 14px; }
  .cr-name { font-size:14px; }
  .cr-preview { max-width:100%; font-size:12.5px; }
  .cr-time { display:none; }

  /* ── Stats strip: 2×2 grid ── */
  .stats-strip { flex-wrap:wrap; }
  .stat-tile {
    flex:0 0 50%; max-width:50%;
    border-bottom:1px solid var(--c-rim);
    padding:14px 14px;
  }
  .stat-tile:nth-child(2n)  { border-right:none; }
  .stat-tile:nth-child(n+3) { border-bottom:none; }
  .st-n { font-size:26px; }

  /* ── Analytics ── */
  .an-body, .ped-body, .inv-body { padding:14px 12px; }
  .an-h1 { font-size:20px; }
  .an-sub { margin-bottom:18px; }
  .an-grid { grid-template-columns:1fr; gap:10px; }
  .an-card.full { grid-column:1; }
  .fn-lbl { width:75px; font-size:10px; }
  .fn-track { height:20px; }

  /* ── Tables: horizontal scroll ── */
  #inv-table-wrap, #ped-table-wrap {
    overflow-x:auto; -webkit-overflow-scrolling:touch;
  }
  .inv-table, .ped-table { min-width:520px; }
  .inv-table th, .inv-table td,
  .ped-table th,  .ped-table td { padding:10px 6px; }

  /* ── Auth overlay ── */
  #token-input, #auth-btn { width:min(88vw, 320px); }
  .auth-logo { font-size:24px; }

  /* ── Pedidos filter chips: scroll ── */
  .ped-filters { flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch; padding-bottom:4px; }
  .ped-filters .chip { flex-shrink:0; }

  /* ── Toast: above bottom nav ── */
  .toast {
    bottom:calc(66px + env(safe-area-inset-bottom));
    right:12px; left:12px; text-align:center;
    font-size:13px;
  }
  @keyframes tIn { from{transform:translateY(30px);opacity:0} to{transform:none;opacity:1} }
}
</style>
</head>
<body>

<!-- ══ AUTH OVERLAY ══ -->
<div id="auth-overlay">
  <div class="auth-logo">MIYU</div>
  <div class="auth-sub">Centro de Operaciones</div>
  <input id="token-input" type="password" placeholder="Token de acceso"
    onkeydown="if(event.key==='Enter') doLogin()">
  <button id="auth-btn" onclick="doLogin()">Acceder</button>
  <div id="auth-error">Token incorrecto — inténtalo de nuevo</div>
</div>

<div class="shell">

  <!-- ══ ICON NAV ══ -->
  <nav class="nav">
    <div class="nav-logo">MIYU</div>
    <div class="nav-btn on" id="nb-chats"     onclick="view('chats')"     title="Conversaciones">💬</div>
    <div class="nav-btn"    id="nb-pedidos"   onclick="view('pedidos')"   title="Pedidos">🛍️</div>
    <div class="nav-btn"    id="nb-analytics" onclick="view('analytics')" title="Métricas">📊</div>
    <div class="nav-btn"    id="nb-stock"     onclick="view('stock')"     title="Inventario">📦</div>
    <div class="nav-spacer"></div>
    <div class="nav-avatar" title="Miyu Beauty">M</div>
  </nav>

  <!-- ══ VIEWS ══ -->
  <div class="views">

    <!-- ──────── VIEW: CHATS ──────── -->
    <div class="view on" id="view-chats">

      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sb-head">
          <div class="sb-eyebrow">Conversaciones</div>
          <input class="sb-search" placeholder="Buscar cliente o número…" oninput="buscar(this.value)">
          <div class="sb-filters">
            <button class="chip on" onclick="filt('todos',this)">Todos</button>
            <button class="chip"    onclick="filt('bot',this)">🤖 Bot</button>
            <button class="chip"    onclick="filt('human',this)">⚡ Control</button>
            <button class="chip"    onclick="filt('vip',this)">★ VIP</button>
          </div>
        </div>
        <div class="chat-list" id="chat-list">
          <div style="padding:24px;text-align:center;color:var(--c-text3);font-size:11.5px;line-height:1.8">
            Conectando al servidor…
          </div>
        </div>
      </aside>

      <!-- Center -->
      <div class="center" id="center">
        <div class="empty">
          <div class="empty-m">M</div>
          <div class="empty-t">Selecciona una conversación</div>
          <div class="empty-s">Toma control de cualquier chat o deja que Miyu lo atienda automáticamente</div>
        </div>
      </div>

      <!-- Right panel -->
      <!-- Backdrop for mobile RP bottom sheet -->
      <div class="rp-backdrop" id="rp-backdrop" onclick="closeRp()"></div>

      <aside class="rp" id="rp" style="display:none">
        <div class="rp-handle"></div>
        <div class="rp-tabs">
          <div class="rp-tab on" onclick="tab('perfil',this)">Perfil</div>
          <div class="rp-tab"    onclick="tab('stock',this)">Stock</div>
          <div class="rp-tab"    onclick="tab('acciones',this)">Acciones</div>
        </div>
        <div class="rp-body" id="rp-body"></div>
      </aside>

    </div><!-- /view-chats -->

    <!-- ──────── VIEW: PEDIDOS ──────── -->
    <div class="view" id="view-pedidos">
      <div class="ped-view">
        <div class="stats-strip">
          <div class="stat-tile">
            <div class="st-n" id="sp-total" style="color:var(--c-gold)">0</div>
            <div class="st-l">Pedidos totales</div>
          </div>
          <div class="stat-tile">
            <div class="st-n" id="sp-pendientes" style="color:var(--c-gold)">0</div>
            <div class="st-l">Pendientes</div>
          </div>
          <div class="stat-tile">
            <div class="st-n" id="sp-ingreso" style="color:var(--c-mint)">$0</div>
            <div class="st-l">Ingreso confirmado</div>
          </div>
          <div class="stat-tile">
            <div class="st-n" id="sp-hoy" style="color:var(--c-blush-lt)">0</div>
            <div class="st-l">Pedidos hoy</div>
          </div>
        </div>
        <div class="ped-body">
          <div class="an-h1">Pedidos</div>
          <div class="an-sub">Gestión de órdenes · actualización cada 10s</div>
          <div class="ped-filters" id="ped-filters">
            <button class="chip on" onclick="filtPed('todos',this)">Todos</button>
            <button class="chip" onclick="filtPed('pendiente',this)">Pendiente</button>
            <button class="chip" onclick="filtPed('confirmado',this)">Confirmado</button>
            <button class="chip" onclick="filtPed('preparando',this)">Preparando</button>
            <button class="chip" onclick="filtPed('enviado',this)">Enviado</button>
            <button class="chip" onclick="filtPed('entregado',this)">Entregado</button>
            <button class="chip" onclick="filtPed('cancelado',this)" style="color:var(--c-blush-lt)">Cancelado</button>
          </div>
          <div id="ped-table-wrap"></div>
        </div>
      </div>
    </div><!-- /view-pedidos -->

    <!-- ──────── VIEW: ANALYTICS ──────── -->
    <div class="view" id="view-analytics">
      <div class="an-view">
        <div class="stats-strip">
          <div class="stat-tile">
            <div class="st-n" id="s-activos">0</div>
            <div class="st-l">Chats activos</div>
            <div class="st-d">↑ en vivo</div>
          </div>
          <div class="stat-tile">
            <div class="st-n" id="s-control">0</div>
            <div class="st-l">En control humano</div>
          </div>
          <div class="stat-tile">
            <div class="st-n" id="s-msgs">0</div>
            <div class="st-l">Mensajes totales</div>
          </div>
          <div class="stat-tile">
            <div class="st-n">$0</div>
            <div class="st-l">Ventas del día</div>
            <div class="st-d" style="color:var(--c-text3)">Integra Mercado Pago</div>
          </div>
        </div>
        <div class="an-body">
          <div class="an-h1">Análisis de Operaciones</div>
          <div class="an-sub">Datos en tiempo real · actualización cada 3 s</div>
          <div class="an-grid">
            <div class="an-card">
              <div class="an-card-t">Mensajes · últimos 7 días <span id="msgs7-total">—</span></div>
              <div class="bar-chart" id="chart-week"></div>
            </div>
            <div class="an-card">
              <div class="an-card-t">Embudo de conversión</div>
              <div class="funnel" id="funnel"></div>
            </div>
            <div class="an-card">
              <div class="an-card-t">Tipos de cliente</div>
              <div class="donut-wrap">
                <svg width="96" height="96" id="donut-svg"></svg>
                <div class="donut-legend" id="donut-legend"></div>
              </div>
            </div>
            <div class="an-card">
              <div class="an-card-t">Productos más consultados</div>
              <table class="ptable">
                <thead><tr><th>#</th><th>Producto</th><th style="text-align:right">Consultas</th></tr></thead>
                <tbody id="prod-tbody"></tbody>
              </table>
            </div>
            <div class="an-card full">
              <div class="an-card-t">Actividad por hora del día <span>Hoy</span></div>
              <div class="hourly-chart" id="hourly-chart"></div>
            </div>
          </div>
        </div>
      </div>
    </div><!-- /view-analytics -->

    <!-- ──────── VIEW: STOCK ──────── -->
    <div class="view" id="view-stock">
      <div class="inv-view">
        <div class="stats-strip">
          <div class="stat-tile">
            <div class="st-n">20</div>
            <div class="st-l">Productos totales</div>
          </div>
          <div class="stat-tile">
            <div class="st-n" id="s-low" style="color:var(--c-gold)">—</div>
            <div class="st-l">Stock bajo</div>
          </div>
          <div class="stat-tile">
            <div class="st-n" id="s-out" style="color:var(--c-blush-lt)">—</div>
            <div class="st-l">Agotados</div>
          </div>
          <div class="stat-tile">
            <div class="st-n" style="font-size:20px;color:var(--c-text3)">Sheets</div>
            <div class="st-l">Conecta para sincronizar</div>
          </div>
        </div>
        <div class="inv-body">
          <div class="an-h1">Inventario</div>
          <div class="an-sub">Stock en tiempo real · conecta Google Sheets para actualización automática</div>
          <div id="inv-table-wrap" style="margin-top:20px"></div>
        </div>
      </div>
    </div><!-- /view-stock -->

  </div><!-- /views -->
</div><!-- /shell -->

<script>
// ══════════════════════════════════════════════
//  SEGURIDAD: escapeHtml para prevenir XSS
// ══════════════════════════════════════════════
function escapeHtml(s) {
  if (typeof s !== 'string') s = String(s ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ══════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════
let adminToken = sessionStorage.getItem('miyu_token') || '';
let pollingInterval = null;

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + adminToken,
  };
}

async function doLogin() {
  const inp = document.getElementById('token-input');
  const err = document.getElementById('auth-error');
  const btn = document.getElementById('auth-btn');
  adminToken = (inp.value || '').trim();
  btn.textContent = 'Verificando…';
  btn.disabled = true;
  err.style.display = 'none';
  try {
    const r = await fetch('/admin/chats', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    if (r.status === 401) {
      err.style.display = 'block';
      adminToken = '';
    } else {
      sessionStorage.setItem('miyu_token', adminToken);
      document.getElementById('auth-overlay').style.display = 'none';
      startApp();
    }
  } catch {
    err.textContent = 'Error de conexión';
    err.style.display = 'block';
  }
  btn.textContent = 'Acceder';
  btn.disabled = false;
}

function startApp() {
  fetchChats();
  fetchInventario();
  fetchPedidos();
  fetchMetricas();
  fetchLeads();
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(fetchChats, 3000);
  setInterval(fetchPedidos,    10000);
  setInterval(fetchMetricas,   30000);
  setInterval(fetchInventario, 60000);
  setInterval(fetchLeads,      15000);
}

// ══════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════
let chats = [], activo = null, filtro = 'todos', tabActual = 'perfil', busq = '';
let inventarioData = [];   // loaded from /admin/inventario
let pedidosData    = [];   // loaded from /admin/pedidos
let metricasData   = null; // loaded from /admin/metricas
let leadsData      = [];   // loaded from /admin/leads
let cotItems       = [];   // cotizador item list
let filtPedidoActual = 'todos';

// ══════════════════════════════════════════════
//  DATA FETCHING
// ══════════════════════════════════════════════
async function fetchChats() {
  try {
    const r = await fetch('/admin/chats', { headers: authHeaders() });
    if (r.status === 401) {
      clearInterval(pollingInterval);
      sessionStorage.removeItem('miyu_token');
      document.getElementById('auth-overlay').style.display = 'flex';
      return;
    }
    let data;
    try {
      data = await r.json();
    } catch {
      console.error('fetchChats: respuesta JSON inválida');
      return;
    }
    if (!data.ok || !data.chats) return;
    chats = data.chats.map(c => ({
      id:       c.telefono,
      nombre:   c.nombre || ('+' + c.telefono),
      tel:      c.telefono,
      tipo:     classTipo(c),
      bot:      !c.enPausa,
      msgs:     (c.historial || []).map(m => ({
        role:  m.rol === 'user' ? 'user' : (m.texto?.startsWith('[Agente humano]') ? 'agent' : 'bot'),
        txt:   (m.texto || '').replace('[Agente humano]: ', ''),
        ts:    m.hora || 'hoy'
      })),
      perfil:   { esVIP: c.esVIP, notas: c.notas, etapa: c.etapa },
      carrito:  null,
      preview:  c.ultimoMensaje || 'Sin mensajes aún',
      mensajesCount: c.mensajes || 0,
    }));
    renderList();
    syncStats();
    if (activo) {
      const u = chats.find(x => x.id === activo.id);
      if (u) {
        const msgsChanged = u.msgs.length !== activo.msgs.length
          || (u.msgs.at(-1)?.ts !== activo.msgs.at(-1)?.ts);
        const botChanged  = u.bot !== activo.bot;
        const inputActual = document.getElementById('ibar-txt')?.value || '';
        activo = u;
        if (msgsChanged || botChanged) {
          renderCenter();
          if (inputActual) {
            const el = document.getElementById('ibar-txt');
            if (el) el.value = inputActual;
          }
        }
      }
    }
  } catch(e) { console.error('fetchChats error:', e.message); }
}

async function fetchInventario() {
  try {
    const r = await fetch('/admin/inventario', { headers: authHeaders() });
    if (!r.ok) return;
    const d = await r.json();
    if (d.ok) inventarioData = d.productos || [];
  } catch(e) { console.error('fetchInventario:', e.message); }
}

async function fetchPedidos() {
  try {
    const r = await fetch('/admin/pedidos', { headers: authHeaders() });
    if (!r.ok) return;
    const d = await r.json();
    if (d.ok) {
      pedidosData = d.pedidos || [];
      if (document.getElementById('view-pedidos')?.classList.contains('on')) buildPedidos();
    }
  } catch(e) { console.error('fetchPedidos:', e.message); }
}

async function fetchMetricas() {
  try {
    const r = await fetch('/admin/metricas', { headers: authHeaders() });
    if (!r.ok) return;
    const d = await r.json();
    if (d.ok) metricasData = d.metricas;
  } catch(e) { console.error('fetchMetricas:', e.message); }
}

async function fetchLeads() {
  try {
    const r = await fetch('/admin/leads', { headers: authHeaders() });
    if (!r.ok) return;
    const d = await r.json();
    if (d.ok) leadsData = d.leads || [];
  } catch(e) { console.error('fetchLeads:', e.message); }
}

function classTipo(c) {
  if (c.esVIP) return 'vip';
  if (c.mensajes > 10) return 'frecuente';
  return 'nuevo';
}

// ══════════════════════════════════════════════
//  RENDER CHAT LIST
// ══════════════════════════════════════════════
function renderList() {
  const el = document.getElementById('chat-list');
  let list = chats.filter(c => {
    if (filtro === 'bot')   return c.bot;
    if (filtro === 'human') return !c.bot;
    if (filtro === 'vip')   return c.tipo === 'vip';
    return true;
  });
  if (busq) list = list.filter(c =>
    c.nombre.toLowerCase().includes(busq.toLowerCase()) || c.tel.includes(busq)
  );
  if (!list.length) {
    el.innerHTML = \`<div style="padding:28px;text-align:center;color:var(--c-text3);font-size:11.5px;line-height:1.9">
      Sin conversaciones activas<br>en este filtro 🌸</div>\`;
    return;
  }
  // Usar data-id en lugar de onclick con interpolación para evitar XSS
  el.innerHTML = list.map((c,i) => {
    const lead = leadsData.find(l => l.telefono === c.id);
    const leadBadge = lead && lead.score > 0
      ? \`<span class="lead-badge lead-\${escapeHtml(lead.etapa||'frio')}">\${lead.score}</span>\`
      : '';
    return \`
    <div class="chat-row \${c.id===activo?.id?'sel':''} \${!c.bot?'paused':''}"
         data-id="\${escapeHtml(c.id)}"
         onclick="selChat(this.dataset.id)"
         style="animation-delay:\${i*.04}s">
      <div class="cr-head">
        <div class="cr-name">\${escapeHtml(c.nombre)}\${leadBadge}</div>
        <div class="cr-time">activo</div>
      </div>
      <div class="cr-preview">\${escapeHtml(c.preview)}</div>
      <div class="cr-tags">
        <span class="tag \${!c.bot?'tag-human':'tag-bot'}">\${!c.bot?'⚡ humano':'🤖 bot'}</span>
        <span class="tag tag-\${c.tipo==='nuevo'?'nuevo':c.tipo==='frecuente'?'frec':'vip'}">\${escapeHtml(c.tipo)}</span>
      </div>
    </div>\`;
  }).join('');
}

// ══════════════════════════════════════════════
//  SELECT CHAT
// ══════════════════════════════════════════════
function isMob() { return window.innerWidth <= 768; }

function backToList() {
  document.getElementById('view-chats')?.classList.remove('chat-open');
  closeRp();
}

function closeRp() {
  const rp = document.getElementById('rp');
  const bd = document.getElementById('rp-backdrop');
  if (rp) rp.classList.remove('open');
  if (bd) bd.classList.remove('on');
}

function selChat(id) {
  activo = chats.find(c => c.id === id);
  const rp = document.getElementById('rp');
  rp.style.display = 'flex';
  rp.style.flexDirection = 'column';
  if (isMob()) {
    document.getElementById('view-chats').classList.add('chat-open');
    closeRp(); // reset sheet when switching chats
  }
  renderList();
  renderCenter();
  renderRP();
}

// ══════════════════════════════════════════════
//  RENDER CENTER
// ══════════════════════════════════════════════
function renderCenter() {
  if (!activo) return;
  const c = activo;
  const safeId     = escapeHtml(c.id);
  const safeNombre = escapeHtml(c.nombre);
  const safeTel    = escapeHtml(c.tel);
  const safeTipo   = escapeHtml(c.tipo);
  document.getElementById('center').innerHTML = \`
    <div class="topbar">
      <div class="tb-left">
        <button class="tb-back" onclick="backToList()" title="Volver">‹</button>
        <div class="tb-av">\${escapeHtml(c.nombre.charAt(0).toUpperCase())}</div>
        <div>
          <div class="tb-name">\${safeNombre}</div>
          <div class="tb-phone">\${safeTel}</div>
        </div>
        <span class="tag \${c.tipo==='vip'?'tag-vip':c.tipo==='frecuente'?'tag-frec':'tag-nuevo'}" style="margin-left:2px">\${safeTipo}</span>
        <span class="tag \${c.bot?'tag-bot':'tag-human'}">\${c.bot?'🤖 bot':'⚡ control'}</span>
      </div>
      <div class="tb-right">
        \${c.bot
          ? \`<button class="btn btn-blush" data-id="\${safeId}" onclick="takeCtrl(this.dataset.id)">⚡ Tomar Control</button>\`
          : \`<button class="btn btn-mint"  data-id="\${safeId}" onclick="releaseBot(this.dataset.id)">🤖 Soltar Bot</button>\`}
        <button class="btn btn-pay"  data-id="\${safeId}" onclick="genLink(this.dataset.id)">💳 Link de Pago</button>
        <button class="btn btn-rim"  data-id="\${safeId}" onclick="sendCat(this.dataset.id)">📋 Catálogo</button>
      </div>
    </div>

    <div class="msgs-wrap" id="msgs-wrap">
      \${!c.msgs.length
        ? \`<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--c-text3);font-size:12px">Sin mensajes todavía</div>\`
        : c.msgs.map(m => \`
          <div class="msg \${escapeHtml(m.role)}">
            <div class="msg-who">\${m.role==='bot'?'✦ MIYU':m.role==='agent'?'⚡ AGENTE':safeNombre.toUpperCase()}</div>
            <div class="bubble">\${escapeHtml(m.txt)}</div>
            <div class="msg-ts">\${escapeHtml(m.ts)}</div>
          </div>\`).join('')}
    </div>

    <div class="ibar">
      <div class="ibar-mode">
        <div class="pip \${c.bot?'pip-bot':'pip-human'}"></div>
        \${c.bot ? 'Bot respondiendo automáticamente — toma control para escribir' : '⚡ Estás en control · modo agente'}
      </div>
      <div class="ibar-row">
        <textarea class="ibar-input" id="ibar-txt"
          placeholder="\${c.bot?'Toma control para escribir…':'Escribe tu mensaje…'}"
          \${c.bot?'disabled':''}
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send()}"
        ></textarea>
        <label class="ibar-img-btn \${c.bot?'disabled':''}" title="Enviar foto"
          style="cursor:\${c.bot?'not-allowed':'pointer'};opacity:\${c.bot?'.4':'1'}">
          📷
          <input type="file" id="ibar-file" accept="image/*" style="display:none"
            \${c.bot?'disabled':''} onchange="sendImage(this)">
        </label>
        <button class="ibar-send" onclick="send()" \${c.bot?'disabled':''}>➤</button>
      </div>
    </div>
  \`;
  setTimeout(() => {
    const w = document.getElementById('msgs-wrap');
    if (w) w.scrollTop = w.scrollHeight;
  }, 30);
}

// ══════════════════════════════════════════════
//  RENDER RIGHT PANEL
// ══════════════════════════════════════════════
function renderRP() {
  const el = document.getElementById('rp-body');
  if (!activo) { el.innerHTML=''; return; }
  const c = activo;
  const safeId = escapeHtml(c.id);
  if (tabActual === 'perfil') {
    el.innerHTML = \`
      <div class="rp-section">
        <div class="rp-title">Identificación</div>
        <div class="kv"><span class="kk">Teléfono</span><span class="vv" style="font-family:'DM Mono',monospace;font-size:11px">\${escapeHtml(c.tel)}</span></div>
        <div class="kv"><span class="kk">Tipo</span><span class="vv vv-gold">\${escapeHtml(c.tipo.toUpperCase())}</span></div>
        <div class="kv"><span class="kk">Tipo de piel</span><span class="vv">\${escapeHtml(c.perfil.tipoPiel||'—')}</span></div>
        <div class="kv"><span class="kk">Tono</span><span class="vv">\${escapeHtml(c.perfil.tono||'—')}</span></div>
      </div>
      <div class="rp-section">
        <div class="rp-title">Historial de compra</div>
        <div class="kv"><span class="kk">Compras</span><span class="vv vv-gold">\${escapeHtml(String(c.perfil.compras||0))}</span></div>
        <div class="kv"><span class="kk">Mensajes</span><span class="vv">\${c.msgs.length}</span></div>
        <div class="kv"><span class="kk">Estado bot</span><span class="vv \${c.bot?'vv-gold':'vv-blush'}">\${c.bot?'Activo':'Pausado'}</span></div>
        <div class="kv"><span class="kk">Carrito</span><span class="vv" style="font-size:11px;max-width:130px">\${escapeHtml(c.carrito||'—')}</span></div>
      </div>
      <div class="rp-section">
        <div class="rp-title">Actividad reciente</div>
        <svg class="spark" id="spark" viewBox="0 0 240 32"></svg>
      </div>\`;
    drawSpark();
  } else if (tabActual === 'stock') {
    const stockList = inventarioData.length ? inventarioData : [];
    el.innerHTML = \`
      <div class="rp-section">
        <div class="rp-title">Inventario rápido</div>
        \${!stockList.length
          ? '<div style="font-size:11px;color:var(--c-text3)">Cargando…</div>'
          : stockList.slice(0,12).map(p=>\`
            <div class="stock-row">
              <span class="sn" title="\${escapeHtml(p.nombre)}">\${escapeHtml(p.nombre.length>24?p.nombre.slice(0,22)+'…':p.nombre)}</span>
              <span class="sq \${p.estado==='agotado'?'out':p.estado==='bajo'?'low':'ok'}">\${p.estado==='agotado'?'✕ Agotado':p.stock+' pzs'}</span>
            </div>\`).join('')}
      </div>\`;
  } else {
    cotItems = []; // reset cotizador on each open
    const invOptions = inventarioData.length
      ? inventarioData.filter(p=>p.activo!==false).map(p =>
          \`<option value="\${escapeHtml(p.id)}" data-precio="\${p.precio}">\${escapeHtml(p.nombre)} — $\${p.precio}</option>\`
        ).join('')
      : '<option value="">Cargando inventario…</option>';
    el.innerHTML = \`
      <div class="rp-section">
        <div class="rp-title">Acciones rápidas</div>
        <button class="action-btn" data-id="\${safeId}" onclick="genLink(this.dataset.id)">💳 Generar link de pago</button>
        <button class="action-btn" data-id="\${safeId}" onclick="sendCat(this.dataset.id)">📋 Enviar catálogo</button>
        <button class="action-btn" data-id="\${safeId}" onclick="sendBank(this.dataset.id)">🏦 Enviar datos bancarios</button>
        <button class="action-btn" data-id="\${safeId}" onclick="markVIP(this.dataset.id)">★ Marcar como VIP</button>
        <button class="action-btn danger" data-id="\${safeId}" onclick="blockTroll(this.dataset.id)">🚫 Bloquear troll</button>
      </div>
      <div class="rp-section">
        <div class="rp-title">Cotizador</div>
        <div id="cot-items" style="margin-bottom:6px"><div style="font-size:11px;color:var(--c-text3);padding:4px 0">Sin productos</div></div>
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <select id="cot-prod" style="flex:1;font-size:11px;background:var(--c-surface2);border:1px solid var(--c-bord);border-radius:6px;color:var(--c-text);padding:5px 6px">
            <option value="">— Seleccionar producto —</option>
            \${invOptions}
          </select>
          <button class="btn btn-gold" style="padding:4px 12px;font-size:12px" onclick="cotAddItem()">+</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:6px;border-top:1px solid var(--c-bord)">
          <span id="cot-total" style="font-size:12px;color:var(--c-gold);font-weight:600">Total: $0</span>
          <button class="btn btn-mint" style="font-size:11px;padding:5px 12px" data-id="\${safeId}" onclick="sendCotizacion(this.dataset.id)">Enviar cotización</button>
        </div>
      </div>
      <div class="rp-section">
        <div class="rp-title">Nota interna</div>
        <textarea class="note-input" placeholder="Agrega contexto sobre este cliente…"></textarea>
        <button class="btn btn-gold" style="width:100%;justify-content:center" onclick="toast('📝 Nota guardada','t-gold')">Guardar nota</button>
      </div>\`;
  }
}

// ══════════════════════════════════════════════
//  COTIZADOR HELPERS
// ══════════════════════════════════════════════
function cotAddItem() {
  const sel = document.getElementById('cot-prod');
  if (!sel || !sel.value) return;
  const id   = sel.value;
  const prod = inventarioData.find(p => p.id === id);
  if (!prod) return;
  const existing = cotItems.find(x => x.id === id);
  if (existing) {
    existing.qty++;
  } else {
    cotItems.push({ id, nombre: prod.nombre, precio: prod.precio, qty: 1 });
  }
  sel.value = '';
  renderCotItems();
}

function cotRemItem(id) {
  cotItems = cotItems.filter(x => x.id !== id);
  renderCotItems();
}

function cotChangeQty(id, qty) {
  const item = cotItems.find(x => x.id === id);
  if (item) item.qty = Math.max(1, parseInt(qty)||1);
  renderCotItems();
}

function renderCotItems() {
  const wrap = document.getElementById('cot-items');
  if (!wrap) return;
  const total = cotItems.reduce((a,x) => a + x.precio * x.qty, 0);
  const totEl = document.getElementById('cot-total');
  if (totEl) totEl.textContent = 'Total: $' + total.toLocaleString();
  if (!cotItems.length) {
    wrap.innerHTML = '<div style="font-size:11px;color:var(--c-text3);padding:4px 0">Sin productos</div>';
    return;
  }
  wrap.innerHTML = cotItems.map(x => \`
    <div class="cot-row">
      <span class="cot-sel" title="\${escapeHtml(x.nombre)}">\${escapeHtml(x.nombre.length>22?x.nombre.slice(0,20)+'…':x.nombre)}</span>
      <input class="cot-qty" type="number" value="\${x.qty}" min="1"
        data-id="\${escapeHtml(x.id)}" onchange="cotChangeQty(this.dataset.id,this.value)" style="width:38px">
      <span style="font-size:11px;color:var(--c-gold);min-width:44px;text-align:right">$\${(x.precio*x.qty).toLocaleString()}</span>
      <button class="cot-del" data-id="\${escapeHtml(x.id)}" onclick="cotRemItem(this.dataset.id)">✕</button>
    </div>\`).join('');
}

async function sendCotizacion(tel) {
  if (!cotItems.length) { toast('⚠ Agrega productos al cotizador','t-blush'); return; }
  try {
    const r = await fetch('/admin/cotizacion', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        telefono: tel,
        items: cotItems.map(x => ({ id: x.id, cantidad: x.qty })),
        enviar: true
      })
    });
    const d = await r.json();
    if (d.ok) {
      cotItems = [];
      renderCotItems();
      toast('✓ Cotización enviada al cliente','t-mint');
    } else {
      toast('⚠ ' + (d.error||'Error'),'t-blush');
    }
  } catch { toast('⚠ Error de conexión','t-blush'); }
}

// ── Sparkline ──
function drawSpark() {
  const el = document.getElementById('spark');
  if (!el) return;
  const pts = Array.from({length:14},()=>Math.random()*28+2);
  const max = Math.max(...pts), W=240, H=32;
  const coords = pts.map((v,i)=>\`\${i*(W/13)},\${H-(v/max)*H}\`).join(' ');
  el.innerHTML = \`
    <defs>
      <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(200,171,110,.25)"/>
        <stop offset="100%" stop-color="rgba(200,171,110,0)"/>
      </linearGradient>
    </defs>
    <polygon points="0,\${H} \${coords} \${W},\${H}" fill="url(#sg)"/>
    <polyline points="\${coords}" fill="none" stroke="rgba(200,171,110,.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\`;
}

// ══════════════════════════════════════════════
//  ANALYTICS CHARTS
// ══════════════════════════════════════════════
function buildAnalytics() {
  syncStats();
  const m = metricasData;
  const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const wv   = [14, 9, 22, 17, 28, 38, 21]; // fallback visual
  const wmax = Math.max(...wv);
  const total = m ? m.mensajesHoy : wv.reduce((a,b)=>a+b,0);
  document.getElementById('msgs7-total').textContent = m ? m.totalConversaciones : total;
  document.getElementById('chart-week').innerHTML = wv.map((v,i)=>\`
    <div class="bc-wrap">
      <div class="bc-bar \${v===Math.max(...wv)?'hi':'lo'}" style="height:\${(v/wmax)*90}%">
        <div class="bc-bar-tip">\${v} msgs</div>
      </div>
      <div class="bc-lbl">\${DAYS[i]}</div>
    </div>\`).join('');

  // Funnel from real data
  const totalMsg = m ? m.totalConversaciones : 100;
  const pedConf  = m ? m.pedidosConfirmados  : 0;
  const pedTot   = m ? m.totalPedidos        : 0;
  const hotLeads = leadsData.filter(l => l.score >= 60).length;
  const fnBase   = Math.max(totalMsg, 1);
  const FN = [
    {l:'Conversaciones totales', v:100,                          n:totalMsg, c:'var(--c-gold)'},
    {l:'Leads calificados',      v:Math.round((hotLeads/Math.max(totalMsg,1))*100)||12, n:hotLeads, c:'var(--c-gold-lt)'},
    {l:'Pedidos generados',      v:Math.round((pedTot/fnBase)*100)||8,  n:pedTot,  c:'var(--c-blush)'},
    {l:'Pedidos confirmados',    v:Math.round((pedConf/fnBase)*100)||4, n:pedConf, c:'var(--c-mint)'},
  ];
  document.getElementById('funnel').innerHTML = FN.map(f=>\`
    <div class="fn">
      <div class="fn-lbl">\${escapeHtml(f.l)}</div>
      <div class="fn-track"><div class="fn-fill" style="width:\${f.v}%;background:\${f.c}">\${f.n}</div></div>
      <div class="fn-n">\${f.n}</div>
    </div>\`).join('');

  // Donut: lead distribution
  const frio     = leadsData.filter(l=>l.score<25).length||1;
  const tibio    = leadsData.filter(l=>l.score>=25&&l.score<60).length||1;
  const caliente = leadsData.filter(l=>l.score>=60&&l.score<85).length||1;
  const listo    = leadsData.filter(l=>l.score>=85).length||1;
  const dTotal   = frio+tibio+caliente+listo;
  const DN = [
    {l:'❄️ Fríos',     v:Math.round((frio/dTotal)*100),     c:'#6688bb'},
    {l:'🌡️ Tibios',   v:Math.round((tibio/dTotal)*100),    c:'#c8ab6e'},
    {l:'♨️ Calientes', v:Math.round((caliente/dTotal)*100), c:'#c97d8e'},
    {l:'🔥 Listos',    v:Math.round((listo/dTotal)*100),    c:'#6daa8e'},
  ];
  buildDonut(DN);

  // Top productos from real metricas
  let PRODS;
  if (m && m.topProductos && m.topProductos.length) {
    PRODS = m.topProductos.map(p => [p.nombre || p.id, String(p.menciones)]);
  } else {
    PRODS = [
      ['Set Anua Heartleaf','—'],['Tirtir Red Cushion','—'],
      ['Beauty of Joseon Sun','—'],['Medicube PDRN Serum','—'],['Dynasty Cream','—'],
    ];
  }
  document.getElementById('prod-tbody').innerHTML = PRODS.slice(0,5).map((p,i)=>\`
    <tr>
      <td class="pt-rank">\${i+1}</td>
      <td>\${escapeHtml(p[0])}</td>
      <td>\${escapeHtml(p[1])}</td>
    </tr>\`).join('');

  // Ingreso stats from real data
  if (m) {
    const sEl = id => document.getElementById(id);
    if (sEl('s-pedidos-tot')) sEl('s-pedidos-tot').textContent = m.totalPedidos;
    if (sEl('s-ingreso-tot')) sEl('s-ingreso-tot').textContent = '$'+Number(m.ingresoTotal||0).toLocaleString();
    if (sEl('s-ingreso-hoy')) sEl('s-ingreso-hoy').textContent = '$'+Number(m.ingresoHoy||0).toLocaleString();
    if (sEl('s-pedidos-hoy')) sEl('s-pedidos-hoy').textContent = m.pedidosHoy;
  }

  const HV = Array.from({length:24},(_,h) => {
    if (h>=10&&h<=13) return 50+Math.random()*50;
    if (h>=18&&h<=22) return 70+Math.random()*60;
    if (h<7||h>23)    return Math.random()*4;
    return Math.random()*25;
  });
  const hmax = Math.max(...HV);
  document.getElementById('hourly-chart').innerHTML = HV.map((v,h)=>\`
    <div class="hc-col">
      <div class="hc-bar \${v>60?'busy':v>25?'medium':''}" style="height:\${Math.max((v/hmax)*52,2)}px"></div>
      <div class="hc-lbl">\${h%4===0?h+'h':''}</div>
    </div>\`).join('');
}

function buildDonut(data) {
  const svg = document.getElementById('donut-svg');
  const leg = document.getElementById('donut-legend');
  if (!svg||!leg) return;
  const total = data.reduce((a,d)=>a+d.v,0);
  let a = -90, paths = '';
  data.forEach(d => {
    const deg = (d.v/total)*360;
    const r=40, cx=48, cy=48;
    const toRad = x => x*Math.PI/180;
    const x1=cx+r*Math.cos(toRad(a)), y1=cy+r*Math.sin(toRad(a));
    a += deg;
    const x2=cx+r*Math.cos(toRad(a)), y2=cy+r*Math.sin(toRad(a));
    paths += \`<path d="M\${cx},\${cy} L\${x1},\${y1} A\${r},\${r} 0 \${deg>180?1:0},1 \${x2},\${y2} Z"
               fill="\${d.c}" opacity=".88" stroke="var(--c-base)" stroke-width=".8"/>\`;
  });
  svg.innerHTML = paths + \`<circle cx="48" cy="48" r="22" fill="var(--c-surface)"/>
    <text x="48" y="52" text-anchor="middle" font-size="10" fill="var(--c-text3)" font-family="DM Mono">\${total}%</text>\`;
  leg.innerHTML = data.map(d=>\`
    <div class="dl">
      <div class="dl-dot" style="background:\${d.c}"></div>
      <span class="dl-name">\${escapeHtml(d.l)}</span>
      <span class="dl-val">\${d.v}%</span>
    </div>\`).join('');
}

// ══════════════════════════════════════════════
//  INVENTORY
// ══════════════════════════════════════════════
function buildInventory() {
  if (!inventarioData.length) {
    fetchInventario().then(() => {
      if (inventarioData.length) buildInventory();
    });
    document.getElementById('inv-table-wrap').innerHTML =
      '<div style="padding:32px;text-align:center;color:var(--c-text3);font-size:12px">Cargando inventario…</div>';
    return;
  }
  const low = inventarioData.filter(p => p.estado === 'bajo').length;
  const out = inventarioData.filter(p => p.estado === 'agotado').length;
  document.getElementById('s-low').textContent = low;
  document.getElementById('s-out').textContent = out;
  document.getElementById('inv-table-wrap').innerHTML = \`
    <table class="inv-table">
      <thead><tr>
        <th>Producto</th><th>Categoría</th><th>Precio</th>
        <th>Stock</th><th>Estado</th><th>Activo</th>
      </tr></thead>
      <tbody>
        \${inventarioData.map(p => {
          const est = p.estado || 'ok';
          const tagCls = est==='ok'?'tag-nuevo':est==='bajo'?'tag-bot':'tag-human';
          const estLabel = est==='ok'?'OK':est==='bajo'?'BAJO':'AGOTADO';
          return \`<tr>
            <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="\${escapeHtml(p.nombre)}">\${escapeHtml(p.nombre)}</td>
            <td style="font-size:10px;color:var(--c-text3)">\${escapeHtml(p.categoria||'')}</td>
            <td>$\${p.precio}</td>
            <td>
              <input class="qty-edit" type="number" value="\${p.stock}" min="0"
                data-id="\${escapeHtml(p.id)}" style="width:54px">
              <button class="save-qty" data-id="\${escapeHtml(p.id)}"
                onclick="saveStock(this.dataset.id)">✓</button>
            </td>
            <td><span class="tag \${tagCls}">\${estLabel}</span></td>
            <td style="text-align:center">
              <input type="checkbox" \${p.activo?'checked':''} data-id="\${escapeHtml(p.id)}"
                onchange="toggleActivo(this.dataset.id, this.checked)">
            </td>
          </tr>\`;
        }).join('')}
      </tbody>
    </table>\`;
}

async function saveStock(id) {
  const input = document.querySelector(\`.qty-edit[data-id="\${CSS.escape(id)}"]\`);
  if (!input) return;
  const nuevoStock = parseInt(input.value);
  if (isNaN(nuevoStock) || nuevoStock < 0) { toast('⚠ Stock inválido','t-blush'); return; }
  try {
    const r = await fetch(\`/admin/inventario/\${encodeURIComponent(id)}\`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ stock: nuevoStock })
    });
    const d = await r.json();
    if (d.ok) {
      toast('✓ Stock actualizado','t-mint');
      await fetchInventario();
      buildInventory();
    } else {
      toast('⚠ ' + (d.error||'Error'),'t-blush');
    }
  } catch { toast('⚠ Error de conexión','t-blush'); }
}

async function toggleActivo(id, activo) {
  try {
    await fetch(\`/admin/inventario/\${encodeURIComponent(id)}\`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ activo })
    });
    toast(activo ? '✓ Producto activado' : '✓ Producto desactivado','t-mint');
    await fetchInventario();
  } catch { toast('⚠ Error de conexión','t-blush'); }
}

// ══════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════
async function takeCtrl(id) {
  await fetch('/admin/pausar', { method:'POST', headers: authHeaders(), body: JSON.stringify({telefono:id}) });
  const c=chats.find(x=>x.id===id); if(c){c.bot=false;activo=c;}
  toast('⚡ Tomaste el control','t-blush'); renderList(); renderCenter(); renderRP();
}
async function releaseBot(id) {
  await fetch('/admin/reactivar', { method:'POST', headers: authHeaders(), body: JSON.stringify({telefono:id}) });
  const c=chats.find(x=>x.id===id); if(c){c.bot=true;activo=c;}
  toast('🤖 Bot reactivado','t-mint'); renderList(); renderCenter(); renderRP();
}
async function send() {
  const el=document.getElementById('ibar-txt');
  if (!el||!el.value.trim()||!activo) return;
  if (activo.bot) { toast('⚠ Toma control primero','t-blush'); return; }
  const txt=el.value.trim(); el.value='';
  const tel=activo.id;
  try {
    const r = await fetch('/admin/enviar', { method:'POST', headers: authHeaders(), body: JSON.stringify({telefono:tel, mensaje:txt}) });
    const d = await r.json();
    if(d.ok){
      activo.msgs.push({role:'agent', txt, ts:'ahora'});
      toast('✓ Mensaje enviado','t-mint'); renderCenter();
    } else {
      toast('⚠ Error al enviar: '+(d.error||''),'t-blush');
    }
  } catch { toast('⚠ Error de conexión','t-blush'); }
}
// Corrige orientación EXIF y redimensiona usando Canvas + createImageBitmap
async function fixImgOrientation(file) {
  // imageOrientation:'from-image' aplica la etiqueta EXIF antes de dibujar en canvas
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const MAX = 1600; // máx lado largo en px
  let w = bitmap.width, h = bitmap.height;
  if (w > MAX || h > MAX) {
    const r = Math.min(MAX / w, MAX / h);
    w = Math.round(w * r);
    h = Math.round(h * r);
  }
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
}

async function sendImage(input) {
  if (!input.files || !input.files[0] || !activo) { input.value=''; return; }
  if (activo.bot) { toast('⚠ Toma control primero','t-blush'); input.value=''; return; }
  const file    = input.files[0];
  const caption = prompt('Pie de foto (opcional — puedes dejarlo vacío):') || '';
  input.value   = '';
  toast('⏳ Procesando imagen…','t-gold');
  try {
    // Corregir orientación EXIF + redimensionar si es necesario
    const blob   = await fixImgOrientation(file);
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = e => res(e.target.result);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
    if (base64.length > 5_800_000) {
      toast('⚠ Imagen muy grande incluso después de comprimir','t-blush');
      return;
    }
    const r = await fetch('/admin/enviar-imagen', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ telefono: activo.id, base64, mimeType: 'image/jpeg', caption })
    });
    const d = await r.json();
    if (d.ok) {
      activo.msgs.push({ role:'agent', txt:'📷 ' + (caption || 'Imagen enviada'), ts:'ahora' });
      toast('✓ Imagen enviada','t-mint');
      renderCenter();
    } else {
      toast('⚠ Error: ' + (d.error||''),'t-blush');
    }
  } catch(err) {
    console.error('sendImage:', err);
    toast('⚠ Error al procesar la imagen','t-blush');
  }
}
async function genLink(id) {
  const m = prompt('Monto del pedido (MXN):');
  if (!m) return;
  const monto = parseFloat(m);
  if (isNaN(monto) || monto <= 0) { toast('⚠ Ingresa un monto válido mayor a 0','t-blush'); return; }
  const r = await fetch('/admin/link-pago', { method:'POST', headers: authHeaders(), body: JSON.stringify({telefono:id, monto, descripcion:'Pedido MIYU Beauty'}) });
  const d = await r.json();
  toast(d.ok?'💳 Link enviado al cliente':'⚠ Configura MP_ACCESS_TOKEN en Railway', d.ok?'t-gold':'t-blush');
}
async function sendCat(id) {
  await fetch('/admin/enviar', { method:'POST', headers: authHeaders(), body: JSON.stringify({telefono:id, mensaje:'📋 Aquí tienes nuestro catálogo completo:\\nhttps://miyuuuu.tiiny.site/\\n\\n¿Algo que te llame la atención? 🌸'}) });
  toast('📋 Catálogo enviado','t-gold');
}
async function sendBank(id) {
  const msg=\`💳 *Datos para transferencia MIYU Beauty:*\\n\\n🏦 Banco: STP\\n👤 Titular: Maria Guadalupe González Miranda\\n💳 Tarjeta: 5319 9500 1011 4248\\n🔢 CLABE: 646990404045356290\\n\\n⚠️ _Estas son nuestras ÚNICAS cuentas oficiales._\`;
  await fetch('/admin/enviar', { method:'POST', headers: authHeaders(), body: JSON.stringify({telefono:id, mensaje:msg}) });
  toast('🏦 Datos bancarios enviados','t-gold');
}
async function markVIP(id) {
  try {
    await fetch('/admin/marcarVIP', { method:'POST', headers: authHeaders(), body: JSON.stringify({telefono:id}) });
  } catch { /* no crítico */ }
  const c=chats.find(x=>x.id===id);
  if(c) c.tipo='vip';
  toast('★ Marcado como VIP','t-gold'); renderList(); renderRP();
}
function blockTroll(id) { toast('🚫 Troll bloqueado (próximamente)','t-blush'); }

// ══════════════════════════════════════════════
//  UI CONTROLS
// ══════════════════════════════════════════════
// ══════════════════════════════════════════════
//  PEDIDOS VIEW
// ══════════════════════════════════════════════
function filtPed(f, btn) {
  filtPedidoActual = f;
  document.querySelectorAll('#ped-filters .chip').forEach(c => c.classList.remove('on'));
  if (btn) btn.classList.add('on');
  buildPedidos();
}

function buildPedidos() {
  const list = filtPedidoActual === 'todos'
    ? pedidosData
    : pedidosData.filter(p => p.estado === filtPedidoActual);
  const sp = id => document.getElementById(id);
  if (sp('sp-total'))     sp('sp-total').textContent = pedidosData.length;
  const pend = pedidosData.filter(p => p.estado === 'pendiente').length;
  if (sp('sp-pendientes')) sp('sp-pendientes').textContent = pend;
  const ingreso = pedidosData
    .filter(p => ['confirmado','preparando','enviado','entregado'].includes(p.estado))
    .reduce((a,p) => a + (p.total||0), 0);
  if (sp('sp-ingreso')) sp('sp-ingreso').textContent = '$' + ingreso.toLocaleString();
  const hoy = new Date().toDateString();
  const pedHoy = pedidosData.filter(p => new Date(p.creadoEn).toDateString() === hoy).length;
  if (sp('sp-hoy')) sp('sp-hoy').textContent = pedHoy;
  const wrap = document.getElementById('ped-table-wrap');
  if (!wrap) return;
  if (!pedidosData.length) {
    wrap.innerHTML = \`<div style="padding:40px;text-align:center;color:var(--c-text3);font-size:12px">
      Sin pedidos registrados aún 📦<br>
      <span style="font-size:11px">Los pedidos aparecerán aquí cuando los crees desde el panel de acciones de un chat</span>
    </div>\`;
    return;
  }
  if (!list.length) {
    wrap.innerHTML = '<div style="padding:32px;text-align:center;color:var(--c-text3);font-size:12px">Sin pedidos en este filtro</div>';
    return;
  }
  const ESTADOS = ['pendiente','confirmado','preparando','enviado','entregado','cancelado'];
  wrap.innerHTML = \`
    <table class="ped-table">
      <thead><tr>
        <th>ID</th><th>Cliente</th><th>Productos</th>
        <th>Total</th><th>Estado</th><th>Fecha</th><th>Cambiar estado</th>
      </tr></thead>
      <tbody>
        \${list.map(p => {
          const prods = (p.productos||[]).map(x => escapeHtml(x.nombre||x.id)).join(', ') || '—';
          const fecha = new Date(p.creadoEn).toLocaleDateString('es-MX', {day:'2-digit',month:'short'});
          const nextEstados = ESTADOS.filter(e => e !== p.estado);
          return \`<tr>
            <td class="ped-id">\${escapeHtml(p.id)}</td>
            <td style="font-size:11px">\${escapeHtml(p.telefono||'')}</td>
            <td style="font-size:11px;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="\${escapeHtml(prods)}">\${prods}</td>
            <td class="ped-total">$\${Number(p.total||0).toLocaleString()}</td>
            <td><span class="status-badge s-\${escapeHtml(p.estado)}">\${escapeHtml(p.estado)}</span></td>
            <td style="font-size:11px">\${fecha}</td>
            <td>
              <select class="qty-edit" style="font-size:10px;width:120px;padding:3px 4px"
                data-pedid="\${escapeHtml(p.id)}"
                onchange="updateOrderStatus(this.dataset.pedid, this.value, this)">
                <option value="">— Estado —</option>
                \${nextEstados.map(e => \`<option value="\${e}">\${e}</option>\`).join('')}
              </select>
            </td>
          </tr>\`;
        }).join('')}
      </tbody>
    </table>\`;
}

async function updateOrderStatus(pedidoId, nuevoEstado, sel) {
  if (!nuevoEstado) return;
  try {
    const r = await fetch(\`/admin/pedidos/\${encodeURIComponent(pedidoId)}\`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ estado: nuevoEstado })
    });
    const d = await r.json();
    if (d.ok) {
      toast(\`✓ Pedido \${pedidoId} → \${nuevoEstado}\`,'t-mint');
      await fetchPedidos();
    } else {
      toast('⚠ ' + (d.error||'Error'),'t-blush');
      if (sel) sel.value = '';
    }
  } catch {
    toast('⚠ Error de conexión','t-blush');
    if (sel) sel.value = '';
  }
}

function view(v) {
  // On mobile, reset chat open state when switching views
  if (isMob()) {
    document.getElementById('view-chats')?.classList.remove('chat-open');
    closeRp();
  }
  ['chats','analytics','stock','pedidos'].forEach(x => {
    const viewEl = document.getElementById(\`view-\${x}\`);
    const nbEl   = document.getElementById(\`nb-\${x}\`);
    if (viewEl) viewEl.classList.toggle('on', x===v);
    if (nbEl)   nbEl.classList.toggle('on', x===v);
  });
  if (v==='analytics') buildAnalytics();
  if (v==='stock')     buildInventory();
  if (v==='pedidos')   buildPedidos();
}
function filt(f,btn) {
  filtro=f;
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));
  btn.classList.add('on');
  renderList();
}
function tab(t,btn) {
  tabActual=t;
  document.querySelectorAll('.rp-tab').forEach(x=>x.classList.remove('on'));
  btn.classList.add('on');
  renderRP();
  if (isMob()) {
    const rp = document.getElementById('rp');
    const bd = document.getElementById('rp-backdrop');
    if (rp) rp.classList.add('open');
    if (bd) bd.classList.add('on');
  }
}
function buscar(q) { busq=q; renderList(); }
function syncStats() {
  const s = id => document.getElementById(id);
  if(s('s-activos')) s('s-activos').textContent = chats.length;
  if(s('s-control')) s('s-control').textContent = chats.filter(c=>!c.bot).length;
  if(s('s-msgs'))    s('s-msgs').textContent    = chats.reduce((a,c)=>a+c.msgs.length,0);
}
function toast(msg,cls) {
  const el=document.createElement('div');
  el.className=\`toast \${cls}\`;
  el.textContent=msg; // textContent, no innerHTML — evita XSS en mensajes de toast
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3000);
}

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
if (adminToken) {
  // Verificar que el token almacenado sigue siendo válido
  fetch('/admin/chats', { headers: { Authorization: 'Bearer ' + adminToken } })
    .then(r => {
      if (r.status === 401) {
        sessionStorage.removeItem('miyu_token');
        adminToken = '';
        document.getElementById('auth-overlay').style.display = 'flex';
      } else {
        document.getElementById('auth-overlay').style.display = 'none';
        startApp();
      }
    })
    .catch(() => {
      document.getElementById('auth-overlay').style.display = 'flex';
    });
} else {
  document.getElementById('auth-overlay').style.display = 'flex';
}
</script>
</body>
</html>
`;

// ============================================================
// RUTAS ADMIN (todas protegidas con adminAuth)
// ============================================================
app.get("/admin", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(DASHBOARD_HTML);
});

app.post("/admin/pausar", adminAuth, (req, res) => {
  const { telefono } = req.body;
  if (!telefono || typeof telefono !== "string" || !telefono.trim())
    return res.json({ ok: false, error: "Falta teléfono válido" });
  modoPausa[telefono] = true;
  console.log(`⏸️  Bot pausado para ${telefono}`);
  res.json({ ok: true, mensaje: `Bot pausado para ${telefono}` });
});

app.post("/admin/reactivar", adminAuth, (req, res) => {
  const { telefono } = req.body;
  if (!telefono || typeof telefono !== "string" || !telefono.trim())
    return res.json({ ok: false, error: "Falta teléfono válido" });
  modoPausa[telefono] = false;
  console.log(`▶️  Bot reactivado para ${telefono}`);
  res.json({ ok: true, mensaje: `Bot reactivado para ${telefono}` });
});

app.post("/admin/enviar", adminAuth, async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || typeof telefono !== "string" || !telefono.trim())
    return res.json({ ok: false, error: "Falta teléfono válido" });
  if (!mensaje || typeof mensaje !== "string" || !mensaje.trim())
    return res.json({ ok: false, error: "Falta mensaje válido" });

  try {
    const resultado = await enviarMensaje(telefono, mensaje);
    if (!resultado.ok) {
      return res.json({ ok: false, error: resultado.error });
    }

    if (!conversaciones[telefono]) conversaciones[telefono] = [];
    conversaciones[telefono].push({
      role: "assistant",
      content: `[Agente humano]: ${mensaje}`,
      ts: new Date().toISOString(),
    });

    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: "Error interno al enviar mensaje" });
  }
});

// ── Enviar imagen (base64 upload o URL pública) ────────────
app.post("/admin/enviar-imagen", adminAuth, async (req, res) => {
  const { telefono, base64, mimeType, url, caption = "" } = req.body;
  if (!telefono || typeof telefono !== "string" || !telefono.trim())
    return res.json({ ok: false, error: "Falta teléfono válido" });
  if (!base64 && !url)
    return res.json({ ok: false, error: "Falta base64 o url de imagen" });

  try {
    let resultado;
    if (base64) {
      // Validar base64 básico
      const cleanB64 = base64.replace(/^data:image\/[a-z]+;base64,/, "");
      const buffer   = Buffer.from(cleanB64, "base64");
      if (buffer.length < 100) return res.json({ ok: false, error: "Imagen inválida o muy pequeña" });
      const ext  = (mimeType || "image/jpeg").split("/")[1] || "jpg";
      const mime = mimeType || "image/jpeg";
      const upload = await subirMediaWA(buffer, mime, `foto.${ext}`);
      if (!upload.ok) return res.json({ ok: false, error: "Error subiendo imagen: " + upload.error });
      resultado = await enviarImagen(telefono, { mediaId: upload.mediaId, caption });
    } else {
      resultado = await enviarImagen(telefono, { url, caption });
    }

    if (!resultado.ok) return res.json({ ok: false, error: resultado.error });

    if (!conversaciones[telefono]) conversaciones[telefono] = [];
    conversaciones[telefono].push({
      role: "assistant",
      content: `[Agente humano]: 📷 ${caption || "Imagen enviada"}`,
      ts: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error /admin/enviar-imagen:", err.message);
    res.json({ ok: false, error: "Error interno al enviar imagen" });
  }
});

app.get("/admin/chats", adminAuth, (req, res) => {
  const chats = Object.keys(conversaciones).map((tel) => {
    const msgs   = conversaciones[tel] || [];
    const perfil = perfilesClientes[tel] || {};
    const ultimo = msgs[msgs.length - 1];
    const ultimoTexto =
      typeof ultimo?.content === "string"
        ? ultimo.content
        : typeof ultimo?.content?.[0]?.text === "string"
        ? ultimo.content[0].text
        : "[media]";

    return {
      telefono:      tel,
      nombre:        perfil.nombre || tel,
      ultimoMensaje: ultimoTexto.slice(0, 80),
      hora:          perfil.ultimoMensaje || new Date().toISOString(),
      mensajes:      msgs.length,
      enPausa:       modoPausa[tel] || false,
      esVIP:         perfil.esVIP || false,
      etapa:         perfil.etapa || "nuevo",
      notas:         perfil.notas || "",
      historial:     msgs.map((m) => ({
        rol:   m.role,
        texto: typeof m.content === "string"
          ? m.content
          : typeof m.content?.[0]?.text === "string"
          ? m.content[0].text
          : "[media]",
        hora:  m.ts || new Date().toISOString(),
      })),
    };
  });

  res.json({ ok: true, chats, total: chats.length });
});

app.post("/admin/marcarVIP", adminAuth, (req, res) => {
  const { telefono } = req.body;
  if (!telefono || typeof telefono !== "string" || !telefono.trim())
    return res.json({ ok: false, error: "Falta teléfono válido" });
  if (!perfilesClientes[telefono]) {
    perfilesClientes[telefono] = {
      telefono,
      primerContacto: new Date().toISOString(),
      ultimoMensaje: new Date().toISOString(),
      mensajes: 0,
      esVIP: true,
      notas: "",
      etapa: "nuevo",
    };
  } else {
    perfilesClientes[telefono].esVIP = true;
  }
  console.log(`★ VIP marcado: ${telefono}`);
  res.json({ ok: true });
});

app.post("/admin/link-pago", adminAuth, async (req, res) => {
  const { telefono, monto, descripcion } = req.body;
  if (!telefono || typeof telefono !== "string")
    return res.json({ ok: false, error: "Falta teléfono" });
  if (!monto || typeof monto !== "number" || monto <= 0)
    return res.json({ ok: false, error: "Monto inválido" });

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return res.json({ ok: false, error: "MP_ACCESS_TOKEN no configurado" });

  try {
    const mpRes = await fetchConTimeout("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ title: descripcion || "Pedido Miyu Beauty", quantity: 1, unit_price: monto }],
        back_urls: { success: "https://miyuuuu.tiiny.site/" },
        auto_return: "approved",
      }),
    });

    const mpData = await mpRes.json();
    const link   = mpData.init_point;
    if (link && telefono) {
      await enviarMensaje(telefono, `💳 Tu link de pago seguro:\n${link}\n\n_Válido por 30 minutos_`);
    }
    res.json({ ok: true, link });
  } catch (err) {
    res.json({ ok: false, error: "Error al generar link de pago" });
  }
});

// ============================================================
// RUTAS: INVENTARIO
// ============================================================
app.get("/admin/inventario", adminAuth, (req, res) => {
  const lista = Object.values(inventario).map(p => ({
    ...p,
    estado: p.stock === 0 ? "agotado" : p.stock <= p.stockMinimo ? "bajo" : "ok",
  }));
  const bajoStock  = lista.filter(p => p.stock > 0 && p.stock <= p.stockMinimo).length;
  const agotados   = lista.filter(p => p.stock === 0).length;
  res.json({ ok:true, productos:lista, total:lista.length, bajoStock, agotados });
});

app.put("/admin/inventario/:id", adminAuth, (req, res) => {
  const { id } = req.params;
  if (!inventario[id]) return res.json({ ok:false, error:"Producto no encontrado" });
  const { stock, precio, activo, imagenUrl, stockMinimo } = req.body;
  if (typeof stock     === "number" && stock     >= 0) inventario[id].stock      = Math.floor(stock);
  if (typeof precio    === "number" && precio    >  0) inventario[id].precio     = precio;
  if (typeof activo    === "boolean")                  inventario[id].activo     = activo;
  if (typeof stockMinimo=== "number"&& stockMinimo>=0) inventario[id].stockMinimo= Math.floor(stockMinimo);
  if (typeof imagenUrl === "string")                   inventario[id].imagenUrl  = imagenUrl.trim();
  console.log(`📦 Inventario actualizado: ${id}`);
  res.json({ ok:true, producto:inventario[id] });
});

app.post("/admin/inventario", adminAuth, (req, res) => {
  const { nombre, precio, stock, stockMinimo, categoria, descripcion } = req.body;
  if (!nombre || typeof nombre !== "string" || !nombre.trim()) return res.json({ ok:false, error:"Falta nombre" });
  if (!precio || typeof precio !== "number" || precio <= 0)    return res.json({ ok:false, error:"Precio inválido" });
  const id = nombre.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,40);
  if (inventario[id]) return res.json({ ok:false, error:"Ya existe un producto con ID similar" });
  inventario[id] = {
    id, nombre:nombre.trim(), precio, stock:stock||0, stockMinimo:stockMinimo||3,
    categoria:categoria||"otro", descripcion:descripcion||"", imagenUrl:"", activo:true, vendidos:0,
  };
  res.json({ ok:true, producto:inventario[id] });
});

// ============================================================
// RUTAS: PEDIDOS
// ============================================================
app.get("/admin/pedidos", adminAuth, (req, res) => {
  const { estado, telefono } = req.query;
  let lista = Object.values(pedidos).sort((a,b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
  if (estado && estado !== "todos")    lista = lista.filter(p => p.estado === estado);
  if (telefono && typeof telefono === "string") lista = lista.filter(p => p.telefono.includes(telefono.trim()));
  res.json({ ok:true, pedidos:lista, total:lista.length });
});

app.post("/admin/pedidos", adminAuth, async (req, res) => {
  const { telefono, productos, total, metodoPago, notas, direccion } = req.body;
  if (!telefono || typeof telefono !== "string") return res.json({ ok:false, error:"Falta teléfono" });
  if (!productos || !Array.isArray(productos) || productos.length === 0) return res.json({ ok:false, error:"Falta productos" });
  if (!total || typeof total !== "number" || total <= 0) return res.json({ ok:false, error:"Total inválido" });
  const p = crearPedido({ telefono, productos, total, metodoPago, notas, direccion });
  // Notificar al cliente
  await enviarMensaje(telefono, `🌸 *¡Hola! Tu pedido ${p.id} ha sido registrado.*\n\nTotal: $${total}\nEstado: Pendiente de confirmación\n\nTe avisamos en cuanto lo confirmemos 💖`);
  res.json({ ok:true, pedido:p });
});

app.put("/admin/pedidos/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { estado, notas } = req.body;
  const estados = ["pendiente","confirmado","preparando","enviado","entregado","cancelado"];
  if (!estado || !estados.includes(estado)) return res.json({ ok:false, error:`Estado inválido. Válidos: ${estados.join(", ")}` });
  const result = await actualizarEstadoPedido(id, estado, notas);
  res.json(result);
});

app.get("/admin/pedidos/:id", adminAuth, (req, res) => {
  const p = pedidos[req.params.id];
  if (!p) return res.json({ ok:false, error:"Pedido no encontrado" });
  res.json({ ok:true, pedido:p });
});

// ============================================================
// RUTAS: MÉTRICAS
// ============================================================
app.get("/admin/metricas", adminAuth, (req, res) => {
  const totalChats  = Object.keys(conversaciones).length;
  const enPausa     = Object.values(modoPausa).filter(Boolean).length;
  const totalMsgs   = Object.values(conversaciones).reduce((a,c) => a + c.length, 0);

  // Top productos mencionados
  const topProductos = Object.entries(metricas.productosMencionados)
    .sort((a,b) => b[1]-a[1]).slice(0,5)
    .map(([id, veces]) => ({ id, nombre:inventario[id]?.nombre || id, veces }));

  // Top productos vendidos
  const topVendidos = Object.values(inventario)
    .sort((a,b) => b.vendidos - a.vendidos).slice(0,5)
    .map(p => ({ id:p.id, nombre:p.nombre, vendidos:p.vendidos, ingresos:p.vendidos*p.precio }));

  // Leads calientes
  const leads = Object.entries(leadScores)
    .filter(([,ld]) => ld.score >= 50)
    .sort((a,b) => b[1].score - a[1].score)
    .slice(0,10)
    .map(([tel,ld]) => ({
      telefono:tel,
      nombre: perfilesClientes[tel]?.nombre || tel,
      score:ld.score,
      label:labelLeadScore(ld.score),
      productos:ld.productos,
    }));

  res.json({
    ok:true,
    metricas: {
      ...metricas,
      totalChatsActivos:  totalChats,
      enControlHumano:    enPausa,
      totalMensajes:      totalMsgs,
      pedidosPendientes:  Object.values(pedidos).filter(p=>p.estado==="pendiente").length,
      valorInventario:    Object.values(inventario).reduce((a,p)=>a+p.precio*p.stock,0),
      topProductosMencionados: topProductos,
      topProductosVendidos:    topVendidos,
      leads,
    }
  });
});

// ============================================================
// RUTAS: SEGUIMIENTOS
// ============================================================
app.get("/admin/seguimientos", adminAuth, (req, res) => {
  const lista = [];
  for (const [tel, segs] of Object.entries(seguimientosAuto)) {
    for (const s of segs) {
      lista.push({ telefono:tel, nombre:perfilesClientes[tel]?.nombre||tel, ...s });
    }
  }
  lista.sort((a,b) => a.enviarEn - b.enviarEn);
  res.json({ ok:true, seguimientos:lista, total:lista.length });
});

app.post("/admin/seguimientos", adminAuth, (req, res) => {
  const { telefono, tipo, horasDelay, mensaje } = req.body;
  if (!telefono || typeof telefono !== "string") return res.json({ ok:false, error:"Falta teléfono" });
  if (!horasDelay || typeof horasDelay !== "number" || horasDelay < 0) return res.json({ ok:false, error:"horasDelay inválido" });
  programarSeguimiento(telefono, tipo||"reenganche", horasDelay, mensaje);
  res.json({ ok:true });
});

app.delete("/admin/seguimientos/:telefono", adminAuth, (req, res) => {
  const { telefono } = req.params;
  cancelarSeguimientos(telefono);
  res.json({ ok:true });
});

// ============================================================
// RUTAS: COTIZACIONES
// ============================================================
app.post("/admin/cotizacion", adminAuth, async (req, res) => {
  const { telefono, items, enviar } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) return res.json({ ok:false, error:"Falta items" });
  const texto = generarCotizacion(items);
  if (enviar && telefono) {
    const r = await enviarMensaje(telefono, texto);
    if (!r.ok) return res.json({ ok:false, error:r.error });
    if (!conversaciones[telefono]) conversaciones[telefono] = [];
    conversaciones[telefono].push({ role:"assistant", content:`[Cotización]: ${texto}`, ts:new Date().toISOString() });
  }
  res.json({ ok:true, texto });
});

// ============================================================
// RUTAS: LEADS
// ============================================================
app.get("/admin/leads", adminAuth, (req, res) => {
  const lista = Object.entries(leadScores)
    .map(([tel, ld]) => ({
      telefono:  tel,
      nombre:    perfilesClientes[tel]?.nombre || tel,
      score:     ld.score,
      label:     labelLeadScore(ld.score),
      productos: ld.productos.map(id => inventario[id]?.nombre || id),
      señales:   ld.señales.slice(-5),
      ultimaInteraccion: perfilesClientes[tel]?.ultimoMensaje || ld.ultimaActualizacion,
    }))
    .sort((a,b) => b.score - a.score);
  res.json({ ok:true, leads:lista, total:lista.length });
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get("/", (req, res) => {
  res.send("🌸 Miyu Beauty Chatbot v3.0 activo");
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
