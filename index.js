const express = require("express");
const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "miyu2026";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;

// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbamskbssecdaaatlkbb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_eI8W5QuRNaCHDkCe75BxZQ_-PVtffXD";

async function supabase(tabla, metodo = "GET", datos = null, filtro = "") {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${tabla}${filtro}`;
    const headers = {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": metodo === "POST" ? "return=representation" : "return=minimal"
    };
    const opts = { method: metodo, headers };
    if (datos) opts.body = JSON.stringify(datos);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.text();
      console.error(`Supabase error [${metodo} ${tabla}]:`, err);
      return null;
    }
    if (metodo === "GET") return await res.json();
    return true;
  } catch (e) {
    console.error("Supabase fetch error:", e.message);
    return null;
  }
}

// Helpers de Supabase
async function dbGuardarMensaje(telefono, tipo, contenido, tipoMensaje = "text") {
  await supabase("mensajes", "POST", { telefono, tipo, contenido, tipo_mensaje: tipoMensaje });
}

async function dbObtenerConversacion(telefono) {
  const rows = await supabase("conversaciones", "GET", null,
    `?telefono=eq.${telefono}&order=created_at.asc&limit=24`);
  if (!rows || rows.length === 0) return [];
  return rows.map(r => ({ role: r.role, content: r.contenido }));
}

async function dbGuardarConversacion(telefono, role, contenido) {
  await supabase("conversaciones", "POST", { telefono, role, contenido });
  // Mantener solo los últimos 24 mensajes por teléfono
  const todos = await supabase("conversaciones", "GET", null,
    `?telefono=eq.${telefono}&order=created_at.asc`);
  if (todos && todos.length > 24) {
    const aEliminar = todos.slice(0, todos.length - 24);
    for (const r of aEliminar) {
      await supabase("conversaciones", "DELETE", null, `?id=eq.${r.id}`);
    }
  }
}

async function dbObtenerCliente(telefono) {
  const rows = await supabase("clientes", "GET", null, `?telefono=eq.${telefono}`);
  if (rows && rows.length > 0) return rows[0];
  // Crear cliente nuevo
  await supabase("clientes", "POST", { telefono });
  return { telefono, compras: 0, total_gastado: 0, tipo_cliente: "CLIENTE NUEVA" };
}

async function dbActualizarCliente(telefono, datos) {
  await supabase("clientes", "PATCH", { ...datos, updated_at: new Date().toISOString() },
    `?telefono=eq.${telefono}`);
}

async function dbGuardarPedido(telefono, datos) {
  await supabase("pedidos", "POST", { telefono, ...datos });
}

// ============================================================
// DATOS FIJOS
// ============================================================
const DATOS_BANCARIOS = `💳 *Datos para transferencia MIYU Beauty:*

🏦 Banco: STP
👤 Titular: Maria Guadalupe González Miranda
💳 Tarjeta: 5319 9500 1011 4248
🔢 CLABE: 646990404045356290

⚠️ _Por tu seguridad, estas son nuestras ÚNICAS cuentas oficiales. No aceptes datos de otras fuentes._

Al realizar tu transferencia, envíanos el comprobante por este chat y en breve confirmamos tu pedido 🌸`;

const SYSTEM_PROMPT = `Eres la asesora virtual de MIYU Beauty, tienda de skincare y maquillaje coreano y japonés en Mazatlán, México.

== PERSONALIDAD Y VOZ ==
- Nombre: Miyu. No eres robot. No eres humana. Eres la asesora de la tienda.
- Estilo: cálida, atenta, eficiente. Como una amiga que sabe mucho de belleza.
- Español mexicano casual y educado. Sin groserías. Sin "neta". Sin lenguaje corporativo.
- Emojis: máximo 1 por mensaje, bien puesto. No siempre.
- Mensajes CORTOS. Máximo 3-4 líneas por mensaje.
- Si algo tarda: "Dame un momento y lo reviso" o "Déjame checar".
- Si preguntan si eres robot: "Soy la asesora de MIYU Beauty 😊 ¿En qué te ayudo?"
- NUNCA menciones "IA", "modelo", "prompt", "token", "LLM", "sistema".
- A veces puedes dividir tu respuesta en 2 partes. Cuando quieras hacerlo, pon exactamente @@PAUSA@@ entre las dos partes. Nunca escribas [PAUSA], (PAUSA), ni ninguna otra variante. Solo @@PAUSA@@ si lo usas.

== DETECCIÓN DE TIPO DE CLIENTE ==
Adapta tu trato según el contexto:
- CLIENTE NUEVA: explica más, sé más paciente, guíala paso a paso.
- CLIENTE FRECUENTE: saluda con familiaridad, recuerda sus preferencias.
- CLIENTE VIP (compras +$2000): trato especial, menciona productos nuevos primero.
- REVENDEDORA/MAYOREO: pregunta cantidad, ofrece precio especial, pide que contacten por Instagram.
- MENUDEO: trato normal, enfocado en 1-2 productos.

== MANEJO DE TROLLS Y SITUACIONES DIFÍCILES ==
- Groserías leves: responde con humor cálido. "Jeje, tranquilo/a 😄 ¿Te ayudo con algo de skincare?"
- Preguntas irrelevantes: "Eso ya está fuera de mi área, pero de belleza sí sé mucho 😄"
- Groserías repetidas (3+): "Si necesitas ayuda con algún producto aquí estoy. ¡Cuídate!"
- NUNCA insultes. NUNCA te enojes. Siempre redirige a ventas.

== ANÁLISIS DE IMÁGENES DE PIEL ==
Si recibes una foto del rostro o piel:
1. Analiza: tono, textura visible, posibles preocupaciones (brillos, manchas, rojeces, poros).
2. Sugiere 1-2 productos específicos del catálogo con precio.
3. SIEMPRE incluye: "Esta es una sugerencia general. Para diagnóstico preciso consulta un dermatólogo."
4. NUNCA diagnostiques condiciones médicas.
5. Si ves irritación severa: "Eso luce como algo que debería ver un dermatólogo 🌸"

== FLUJO DE VENTA ==
1. Saluda y pregunta qué busca o cuál es su preocupación.
2. Recomienda 1-2 productos máximo con precio.
3. Cross-sell suave si aplica.
4. Al mostrar interés: pide nombre completo y dirección.
5. Confirma total + método de pago.
6. Si pide transferencia o confirma pedido: incluye @@DATOS_BANCO@@ en tu respuesta.
7. Cierra con entusiasmo.

== RECUPERACIÓN DE CARRITO ==
Si el cliente preguntó por productos antes pero no compró, menciónalo con naturalidad:
"Oye, la última vez preguntaste por [producto], ¿lo seguías considerando? 😊"

== MANEJO DE URGENCIAS ==
Si detectas "reacción", "alergia", "irritación severa", "me lastimó", "quemadura":
1. Responde con prioridad y empatía.
2. "Si la reacción es severa, ve a urgencias médicas. ¿Qué producto usaste?"
3. No minimices. No des diagnóstico médico.

== POST-VENTA ==
Cuando confirmes un pedido con dirección, incluye @@POSTVENTA@@ en tu respuesta (no lo muestres al cliente).

== CATÁLOGO COMPLETO MIYU BEAUTY ==

PROTECCIÓN SOLAR:
- Beauty of Joseon Relief Sun SPF50+ PA++++ → $550 MXN. Ilumina, hidrata, unifica. El más vendido.
- Bioré UV SPF50+ PA++++ → $475 MXN. Alta protección, resistente al sudor.

CUIDADO CAPILAR:
- Mascarilla Capilar Fino Shiseido → $500 MXN. Para cabello dañado. Deja sedoso.
- &Honey Aceite Capilar → $500 MXN. Hidratación profunda, antifrizz.
- CER-100 Tratamiento con Colágeno → $395 MXN. Repara, fortalece, brillo.

MAQUILLAJE:
- Tirtir Mask Fit Red Cushion SPF40 PA++ → $800 MXN. 72h, no se transfiere, acabado glow.
- Mascara Heroine Make → $450 MXN. Riza, alarga, resistente al agua.
- Removedor Heroine Make → $450 MXN. Quita hasta el más resistente.
- Delineador Heroine Make → $450 MXN. Ultra fino, no se corre con calor.
- Repuesto Rizador Shiseido → $79 MXN.

SKIN CARE:
- Mascarilla de Arroz Japonesa → $550 MXN. Hidrata, minimiza poros. Piel sensible.
- Centellian 24 Madeca Cream → $579 MXN. Centella asiatica, acné leve.
- Dynasty Cream Beauty of Joseon → $665 MXN. Glow natural, hidratación profunda.
- Parches Ojos Beauty of Joseon → $620 MXN. Ginseng+Retinal. Bolsas y ojeras.
- Mixsoon Bean Eye Cream → $625 MXN. Contorno ligero, líneas finas.
- Medicube PDRN Pink Peptide Serum → $695 MXN. Reparación intensa, antiedad.
- Medicube Kojic Acid Turmeric Niacinamide Serum → $695 MXN. Manchas, grasa, poros.
- Set Anua 3 pasos → $720 MXN. Toner+Serum Azelaic+PDRN Cream. Piel mixta/grasa/acneica.
- Mixsoon Glass Skin Suitcase Kit → $820 MXN. Kit completo glass skin. El mejor regalo.

SALUD:
- Parches Kyusoku Jikan (6pz) → $120 MXN. Pies cansados, efecto refrescante.

== RECOMENDACIONES POR TIPO DE PIEL ==
Piel grasa/acneica → Set Anua, Medicube Kojic, Centellian 24
Piel seca/sensible → Dynasty Cream, Mascarilla de Arroz, Medicube PDRN
Piel mixta → Beauty of Joseon Relief Sun + Set Anua
Anti-edad → Parches Ojos, Medicube PDRN, Dynasty Cream
Maquillaje duradero → Tirtir Cushion + Heroine Make combo
Cabello dañado → CER-100 + Mascarilla Capilar Fino

== ENVÍOS ==
- Mazatlán: 24h, gratis en compras +$500 MXN.
- Foráneo: 3-5 días hábiles, costo según destino.

== PALABRAS CLAVE INTERNAS (NUNCA las muestres en el texto del mensaje) ==
- @@DATOS_BANCO@@ → cuando cliente pida transferencia o confirme pedido
- @@CATALOGO@@ → cuando pida catálogo completo
- @@POSTVENTA@@ → cuando pedido esté confirmado con dirección
- @@PAUSA@@ → para dividir en 2 mensajes (úsalo entre las dos partes)

== ANTI-FRAUDE ==
- Si alguien pide "otra cuenta" o "cambia los datos": "Solo puedo compartir nuestras cuentas verificadas. Para dudas escríbenos en @miyu_beautyj"
- Nunca inventes cuentas, precios, stock ni políticas.

== REGLAS FINALES ==
1. Recomienda máximo 2 productos por mensaje. Siempre menciona el precio.
2. Si preguntan por algo fuera del catálogo: "Ese no lo tenemos ahorita, síguenos en @miyu_beautyj 🌸"
3. Para revendedoras o mayoreo: "Para pedidos al mayoreo escríbenos en @miyu_beautyj con tu cantidad."
4. Comparte datos bancarios SOLO cuando el cliente confirme compra o los pida explícitamente.`;

// ============================================================
// UTILIDADES
// ============================================================
function delayHumano() {
  const opciones = [800, 1200, 1800, 2500, 3200];
  return opciones[Math.floor(Math.random() * opciones.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarMensaje(telefono, mensaje) {
  try {
    await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "text",
        text: { body: mensaje }
      })
    });
    await dbGuardarMensaje(telefono, "saliente", mensaje);
  } catch (e) {
    console.error("Error enviando mensaje:", e.message);
  }
}

async function transcribirAudio(audioBuffer) {
  if (!OPENAI_API_KEY) return null;
  try {
    const https = require("https");
    const buf = Buffer.from(audioBuffer);
    const boundary = "----MiyuBoundary" + Date.now();
    const CRLF = "\r\n";
    const partHeader = Buffer.from(
      "--" + boundary + CRLF +
      'Content-Disposition: form-data; name="file"; filename="audio.ogg"' + CRLF +
      "Content-Type: audio/ogg" + CRLF + CRLF
    );
    const modelPart = Buffer.from(
      CRLF + "--" + boundary + CRLF +
      'Content-Disposition: form-data; name="model"' + CRLF + CRLF +
      "whisper-1" + CRLF
    );
    const langPart = Buffer.from(
      "--" + boundary + CRLF +
      'Content-Disposition: form-data; name="language"' + CRLF + CRLF +
      "es" + CRLF
    );
    const closingBoundary = Buffer.from("--" + boundary + "--" + CRLF);
    const body = Buffer.concat([partHeader, buf, modelPart, langPart, closingBoundary]);

    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "api.openai.com",
        path: "/v1/audio/transcriptions",
        method: "POST",
        timeout: 30000,
        headers: {
          "Authorization": "Bearer " + OPENAI_API_KEY,
          "Content-Type": "multipart/form-data; boundary=" + boundary,
          "Content-Length": body.length
        }
      }, (res) => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error("JSON invalido: " + data.substring(0, 100))); }
        });
      });
      req.on("error", e => reject(e));
      req.on("timeout", () => { req.destroy(); reject(new Error("Timeout Whisper 30s")); });
      req.write(body);
      req.end();
    });

    return result.text || null;
  } catch (e) {
    console.error("Error en transcribirAudio:", e.message);
    return null;
  }
}

async function analizarImagen(imageUrl) {
  try {
    const imgResp = await fetch(imageUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    const imgBuffer = await imgResp.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString("base64");
    const contentType = imgResp.headers.get("content-type") || "image/jpeg";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: contentType, data: base64 } },
            { type: "text", text: "Analiza esta imagen. Si es foto de piel o rostro, recomienda productos del catálogo con precio. Si es comprobante de pago, confírmalo. Responde como Miyu, de forma cálida y breve." }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.content[0].text;
  } catch (e) {
    console.error("Error analizando imagen:", e.message);
    return "Vi tu imagen 😊 ¿Me puedes decir cuál es tu preocupación principal de piel para recomendarte algo?";
  }
}

async function consultarClaude(historial, mensajeNuevo, perfilTexto) {
  const systemFinal = perfilTexto
    ? `${SYSTEM_PROMPT}\n\n== PERFIL DE ESTA CLIENTA ==\n${perfilTexto}`
    : SYSTEM_PROMPT;

  const messages = [...historial, { role: "user", content: mensajeNuevo }];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: systemFinal,
      messages
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  if (!data.content || !data.content[0]) throw new Error("Respuesta vacía");
  return data.content[0].text;
}

function limpiarTexto(texto) {
  return texto
    .replace(/@@PAUSA@@/g, "")
    .replace(/\[PAUSA\]/gi, "")
    .replace(/\(PAUSA\)/gi, "")
    .replace(/@@DATOS_BANCO@@/g, "")
    .replace(/@@CATALOGO@@/g, "")
    .replace(/@@POSTVENTA@@/g, "")
    .trim();
}

async function procesarYEnviar(telefono, respuesta) {
  if (respuesta.includes("@@PAUSA@@")) {
    const partes = respuesta.split("@@PAUSA@@");
    const parte1 = limpiarTexto(partes[0]);
    const parte2 = limpiarTexto(partes[1] || "");
    if (parte1) await enviarMensaje(telefono, parte1);
    await sleep(delayHumano());
    if (parte2) await enviarMensaje(telefono, parte2);
  } else {
    const limpio = limpiarTexto(respuesta);
    if (limpio) await enviarMensaje(telefono, limpio);
  }

  if (respuesta.includes("@@DATOS_BANCO@@")) {
    await sleep(800);
    await enviarMensaje(telefono, DATOS_BANCARIOS);
  }

  if (respuesta.includes("@@CATALOGO@@")) {
    await sleep(800);
    await enviarMensaje(telefono, "📋 Aquí puedes ver nuestro catálogo completo:\nhttps://miyuuuu.tiiny.site/\n\n¿Algo que te llame la atención? 🌸");
  }

  if (respuesta.includes("@@POSTVENTA@@")) {
    // Guardar pedido pendiente en Supabase
    await dbGuardarPedido(telefono, { estado: "pendiente", productos: "Por confirmar" });
    console.log(`📦 Post-venta registrado en Supabase para ${telefono}`);
  }
}

function esOfensivo(texto) {
  const malas = ["puta", "chinga", "pendej", "cabrón", "cabron", "mierda", "idiota", "estupid", "imbecil", "imbécil", "puto"];
  return malas.some(p => texto.toLowerCase().includes(p));
}

function detectarTipoCliente(texto, perfil) {
  const t = texto.toLowerCase();
  if (t.includes("mayoreo") || t.includes("revendedora") || t.includes("revender") || t.includes("docena")) {
    return "REVENDEDORA/MAYOREO";
  }
  if (perfil && perfil.compras > 3) return "CLIENTE FRECUENTE";
  if (perfil && perfil.total_gastado > 2000) return "CLIENTE VIP";
  return "CLIENTE NUEVA";
}

// Cache local ligero para evitar demasiadas consultas a Supabase
const contadorTrolls = {};

// ============================================================
// DASHBOARD
// ============================================================
app.get("/dashboard", async (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MIYU Beauty — Dashboard</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');

    :root {
      --rosa: #f4a7b9;
      --rosa-dark: #e8849b;
      --crema: #fdf6f0;
      --cafe: #3d2b1f;
      --cafe-light: #6b4c3b;
      --dorado: #c9a96e;
      --verde: #7db89f;
      --bg: #faf5f0;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'DM Sans', sans-serif;
      background: var(--bg);
      color: var(--cafe);
      min-height: 100vh;
    }

    header {
      background: var(--cafe);
      padding: 20px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 20px rgba(61,43,31,0.3);
    }

    .logo {
      font-family: 'Playfair Display', serif;
      color: var(--rosa);
      font-size: 26px;
      letter-spacing: 2px;
    }

    .logo span { color: var(--dorado); }

    .status-dot {
      width: 10px; height: 10px;
      background: var(--verde);
      border-radius: 50%;
      display: inline-block;
      margin-right: 8px;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.3); }
    }

    .live-badge {
      color: var(--verde);
      font-size: 13px;
      font-weight: 500;
    }

    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }

    .grid-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .stat-card {
      background: white;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 2px 12px rgba(61,43,31,0.08);
      border-left: 4px solid var(--rosa);
      transition: transform 0.2s;
    }

    .stat-card:hover { transform: translateY(-3px); }
    .stat-card.verde { border-left-color: var(--verde); }
    .stat-card.dorado { border-left-color: var(--dorado); }
    .stat-card.cafe { border-left-color: var(--cafe-light); }

    .stat-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--cafe-light);
      margin-bottom: 8px;
    }

    .stat-value {
      font-family: 'Playfair Display', serif;
      font-size: 36px;
      color: var(--cafe);
      line-height: 1;
    }

    .stat-sub { font-size: 12px; color: #999; margin-top: 4px; }

    .grid-main {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }

    @media (max-width: 768px) { .grid-main { grid-template-columns: 1fr; } }

    .card {
      background: white;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 2px 12px rgba(61,43,31,0.08);
    }

    .card-title {
      font-family: 'Playfair Display', serif;
      font-size: 18px;
      color: var(--cafe);
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--crema);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mensaje-item {
      padding: 12px 0;
      border-bottom: 1px solid var(--crema);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .mensaje-item:last-child { border-bottom: none; }

    .msg-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .msg-telefono {
      font-weight: 500;
      font-size: 13px;
      color: var(--cafe);
    }

    .msg-time {
      font-size: 11px;
      color: #bbb;
    }

    .msg-text {
      font-size: 13px;
      color: var(--cafe-light);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 500;
    }

    .badge-entrante { background: #e8f5e9; color: #388e3c; }
    .badge-saliente { background: #fce4ec; color: #c62828; }
    .badge-pendiente { background: #fff3e0; color: #e65100; }
    .badge-confirmado { background: #e8f5e9; color: #2e7d32; }
    .badge-entregado { background: #e3f2fd; color: #1565c0; }

    .pedido-item {
      padding: 14px 0;
      border-bottom: 1px solid var(--crema);
    }

    .pedido-item:last-child { border-bottom: none; }

    .pedido-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .pedido-tel { font-weight: 500; font-size: 13px; }
    .pedido-fecha { font-size: 11px; color: #bbb; }
    .pedido-productos { font-size: 12px; color: var(--cafe-light); }

    .clientes-list { display: flex; flex-direction: column; gap: 0; }

    .cliente-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 0;
      border-bottom: 1px solid var(--crema);
    }

    .cliente-item:last-child { border-bottom: none; }

    .avatar {
      width: 38px; height: 38px;
      background: linear-gradient(135deg, var(--rosa), var(--dorado));
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Playfair Display', serif;
      color: white;
      font-size: 15px;
      flex-shrink: 0;
    }

    .cliente-info { flex: 1; }
    .cliente-tel { font-weight: 500; font-size: 13px; }
    .cliente-tipo { font-size: 11px; color: #bbb; }
    .cliente-compras { font-size: 12px; color: var(--dorado); font-weight: 500; }

    .refresh-btn {
      background: var(--rosa);
      color: white;
      border: none;
      padding: 10px 24px;
      border-radius: 30px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
      font-weight: 500;
    }

    .refresh-btn:hover { background: var(--rosa-dark); }

    .empty { color: #ccc; font-size: 13px; text-align: center; padding: 20px; }

    .full-card { grid-column: 1 / -1; }

    .productos-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }

    .producto-pill {
      background: var(--crema);
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 12px;
    }

    .producto-nombre { font-weight: 500; color: var(--cafe); margin-bottom: 4px; }
    .producto-precio { color: var(--dorado); font-size: 13px; font-weight: 600; }

    #loading { text-align: center; padding: 60px; color: var(--cafe-light); font-size: 15px; }
  </style>
</head>
<body>
  <header>
    <div class="logo">MIYU <span>Beauty</span></div>
    <div>
      <span class="status-dot"></span>
      <span class="live-badge">Dashboard en vivo</span>
    </div>
  </header>

  <div class="container" id="app">
    <div id="loading">Cargando datos... 🌸</div>
  </div>

  <script>
    const SUPABASE_URL = "${SUPABASE_URL}";
    const SUPABASE_KEY = "${SUPABASE_KEY}";

    async function query(tabla, params = "") {
      const res = await fetch(SUPABASE_URL + "/rest/v1/" + tabla + params, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY
        }
      });
      return res.json();
    }

    function timeAgo(dateStr) {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "ahora";
      if (mins < 60) return mins + "m";
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + "h";
      return Math.floor(hrs / 24) + "d";
    }

    function inicial(tel) {
      return tel ? tel.slice(-2).toUpperCase() : "??";
    }

    async function cargarDatos() {
      const [mensajes, clientes, pedidos] = await Promise.all([
        query("mensajes", "?order=created_at.desc&limit=50"),
        query("clientes", "?order=updated_at.desc&limit=20"),
        query("pedidos", "?order=created_at.desc&limit=20")
      ]);

      const totalMensajes = mensajes.length || 0;
      const totalClientes = clientes.length || 0;
      const pedidosPendientes = pedidos.filter(p => p.estado === "pendiente").length || 0;
      const hoy = new Date().toDateString();
      const mensajesHoy = mensajes.filter(m => new Date(m.created_at).toDateString() === hoy).length;

      document.getElementById("app").innerHTML = \`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;">
          <div>
            <h1 style="font-family:'Playfair Display',serif;font-size:28px;color:var(--cafe)">Panel de Control</h1>
            <p style="color:#bbb;font-size:13px;margin-top:4px">Actualizado hace unos segundos</p>
          </div>
          <button class="refresh-btn" onclick="cargarDatos()">↻ Actualizar</button>
        </div>

        <div class="grid-stats">
          <div class="stat-card">
            <div class="stat-label">💬 Mensajes hoy</div>
            <div class="stat-value">\${mensajesHoy}</div>
            <div class="stat-sub">de \${totalMensajes} en total</div>
          </div>
          <div class="stat-card verde">
            <div class="stat-label">👥 Clientes</div>
            <div class="stat-value">\${totalClientes}</div>
            <div class="stat-sub">registrados</div>
          </div>
          <div class="stat-card dorado">
            <div class="stat-label">📦 Pedidos pendientes</div>
            <div class="stat-value">\${pedidosPendientes}</div>
            <div class="stat-sub">por confirmar</div>
          </div>
          <div class="stat-card cafe">
            <div class="stat-label">📨 Total mensajes</div>
            <div class="stat-value">\${totalMensajes}</div>
            <div class="stat-sub">conversaciones guardadas</div>
          </div>
        </div>

        <div class="grid-main">
          <div class="card">
            <div class="card-title">💬 Últimos mensajes</div>
            \${mensajes.length === 0
              ? '<div class="empty">Sin mensajes aún</div>'
              : mensajes.slice(0, 10).map(m => \`
              <div class="mensaje-item">
                <div class="msg-header">
                  <span class="msg-telefono">+\${m.telefono}</span>
                  <div style="display:flex;gap:6px;align-items:center">
                    <span class="badge badge-\${m.tipo}">\${m.tipo}</span>
                    <span class="msg-time">\${timeAgo(m.created_at)}</span>
                  </div>
                </div>
                <div class="msg-text">\${m.contenido || "(imagen/audio)"}</div>
              </div>\`).join("")
            }
          </div>

          <div class="card">
            <div class="card-title">👥 Clientes recientes</div>
            <div class="clientes-list">
              \${clientes.length === 0
                ? '<div class="empty">Sin clientes aún</div>'
                : clientes.slice(0, 8).map(c => \`
                <div class="cliente-item">
                  <div class="avatar">\${inicial(c.telefono)}</div>
                  <div class="cliente-info">
                    <div class="cliente-tel">+\${c.telefono}</div>
                    <div class="cliente-tipo">\${c.tipo_cliente || "CLIENTE NUEVA"} \${c.nombre ? "· " + c.nombre : ""}</div>
                  </div>
                  <div class="cliente-compras">\${c.compras || 0} compras</div>
                </div>\`).join("")
              }
            </div>
          </div>
        </div>

        <div class="card full-card" style="margin-bottom:24px">
          <div class="card-title">📦 Pedidos</div>
          \${pedidos.length === 0
            ? '<div class="empty">Sin pedidos registrados aún</div>'
            : pedidos.map(p => \`
            <div class="pedido-item">
              <div class="pedido-header">
                <span class="pedido-tel">+\${p.telefono}</span>
                <div style="display:flex;gap:8px;align-items:center">
                  <span class="badge badge-\${p.estado}">\${p.estado}</span>
                  <span class="pedido-fecha">\${timeAgo(p.created_at)}</span>
                </div>
              </div>
              <div class="pedido-productos">\${p.productos || "Productos por confirmar"} \${p.nombre_cliente ? "· " + p.nombre_cliente : ""}</div>
            </div>\`).join("")
          }
        </div>
      \`;
    }

    cargarDatos();
    setInterval(cargarDatos, 30000); // Auto-refresh cada 30 segundos
  </script>
</body>
</html>`);
});

// ============================================================
// WEBHOOK GET
// ============================================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============================================================
// WEBHOOK POST
// ============================================================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const mensaje = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!mensaje) return;

    const telefono = mensaje.from;
    const tipo = mensaje.type;

    console.log(`📩 Mensaje tipo [${tipo}] de ${telefono}`);

    if (!contadorTrolls[telefono]) contadorTrolls[telefono] = 0;

    // Obtener cliente y conversación desde Supabase
    const perfil = await dbObtenerCliente(telefono);
    const historial = await dbObtenerConversacion(telefono);

    let textoParaClaude = "";

    // AUDIO
    if (tipo === "audio") {
      const audioId = mensaje.audio?.id;
      if (OPENAI_API_KEY && audioId) {
        try {
          await enviarMensaje(telefono, "Dame un momento, escucho tu audio 🎤");
          const mediaResp = await fetch(`https://graph.facebook.com/v18.0/${audioId}`, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
          });
          const mediaData = await mediaResp.json();
          if (!mediaData.url) {
            await enviarMensaje(telefono, "No pude obtener el audio 😅 ¿Me lo puedes escribir?");
            return;
          }
          const audioResp = await fetch(mediaData.url, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
          });
          if (!audioResp.ok) {
            await enviarMensaje(telefono, "No pude descargar el audio 😅 ¿Me lo puedes escribir?");
            return;
          }
          const audioBuffer = await audioResp.arrayBuffer();
          const transcripcion = await transcribirAudio(audioBuffer);
          if (transcripcion) {
            textoParaClaude = `[El cliente mando un audio. Transcripcion: "${transcripcion}"]`;
            await dbGuardarMensaje(telefono, "entrante", transcripcion, "audio");
          } else {
            await enviarMensaje(telefono, "No pude entender bien el audio 😅 ¿Me lo puedes escribir?");
            return;
          }
        } catch (audioError) {
          console.error("Error procesando audio:", audioError.message);
          await enviarMensaje(telefono, "Tuve un problema con el audio 😅 ¿Me lo puedes escribir?");
          return;
        }
      } else {
        await enviarMensaje(telefono, "No pude escuchar ese audio desde aquí 😅 ¿Me lo puedes escribir?");
        return;
      }
    }

    // IMAGEN
    else if (tipo === "image") {
      const mediaId = mensaje.image?.id;
      if (mediaId) {
        const mediaResp = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
          headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
        });
        const mediaData = await mediaResp.json();
        await sleep(delayHumano());
        await enviarMensaje(telefono, "Dame un momento y reviso tu foto 🔍");
        await sleep(1500);
        const analisis = await analizarImagen(mediaData.url);
        const analisisLimpio = limpiarTexto(analisis);
        await enviarMensaje(telefono, analisisLimpio);
        await dbGuardarConversacion(telefono, "user", "[envió una imagen]");
        await dbGuardarConversacion(telefono, "assistant", analisisLimpio);
        await dbGuardarMensaje(telefono, "entrante", "[imagen]", "image");
        return;
      }
    }

    // STICKER / VIDEO / DOCUMENTO
    else if (["sticker", "video", "document", "location"].includes(tipo)) {
      await enviarMensaje(telefono, "No puedo abrir eso desde aquí 😅 ¿Me cuentas qué buscas?");
      return;
    }

    // TEXTO
    else if (tipo === "text") {
      textoParaClaude = mensaje.text.body;
      await dbGuardarMensaje(telefono, "entrante", textoParaClaude, "text");
    } else {
      return;
    }

    // Detección de ofensivos
    if (esOfensivo(textoParaClaude)) {
      contadorTrolls[telefono]++;
      if (contadorTrolls[telefono] >= 3) {
        await enviarMensaje(telefono, "Si necesitas ayuda con algún producto aquí estoy 🌸 ¡Cuídate!");
        contadorTrolls[telefono] = 0;
        return;
      }
      await enviarMensaje(telefono, "Jeje, tranqui 😄 ¿Te ayudo con algo de skincare?");
      return;
    }
    contadorTrolls[telefono] = 0;

    // Perfil de cliente
    const tipoCliente = detectarTipoCliente(textoParaClaude, perfil);
    let perfilTexto = `Tipo de cliente: ${tipoCliente}`;
    if (perfil.nombre) perfilTexto += `\nNombre: ${perfil.nombre}`;
    if (perfil.tipo_piel) perfilTexto += `\nTipo de piel: ${perfil.tipo_piel}`;
    if (perfil.compras > 0) perfilTexto += `\nCompras anteriores: ${perfil.compras}`;

    // Actualizar tipo de cliente en DB
    await dbActualizarCliente(telefono, { tipo_cliente: tipoCliente });

    // Delay humano
    await sleep(delayHumano());

    if (Math.random() < 0.15) {
      await enviarMensaje(telefono, "Dame un momento 😊");
      await sleep(1500);
    }

    // Consultar Claude
    const respuesta = await consultarClaude(historial, textoParaClaude, perfilTexto);
    console.log(`🤖 Respuesta Claude: ${respuesta.substring(0, 100)}...`);

    // Guardar en Supabase
    await dbGuardarConversacion(telefono, "user", textoParaClaude);
    await dbGuardarConversacion(telefono, "assistant", respuesta);

    await procesarYEnviar(telefono, respuesta);
    console.log(`✅ Respuesta enviada a ${telefono}`);

  } catch (error) {
    console.error("❌ Error general:", error.message);
  }
});

// Post-venta automático cada 30 min
setInterval(async () => {
  try {
    const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const pedidos = await supabase("pedidos", "GET", null,
      `?estado=eq.pendiente&created_at=lt.${hace48h}`);
    if (!pedidos) return;
    for (const pedido of pedidos) {
      await enviarMensaje(pedido.telefono, "¡Hola! 😊 ¿Cómo llegó tu pedido de MIYU Beauty? Espero que todo haya estado perfecto. Si tienes alguna duda o quieres dejarnos una reseña, aquí estamos 🌸");
      await supabase("pedidos", "PATCH", { estado: "entregado", updated_at: new Date().toISOString() },
        `?id=eq.${pedido.id}`);
      console.log(`⭐ Post-venta enviado a ${pedido.telefono}`);
    }
  } catch (e) {
    console.error("Error post-venta:", e.message);
  }
}, 30 * 60 * 1000);

app.get("/", (req, res) => res.send("🌸 Miyu Beauty Chatbot v3.0 con Supabase activo"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
