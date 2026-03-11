"use strict";
const express = require("express");
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
app.use(express.json({ limit: "2mb" }));

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
      console.log(`🧹 Conversación inactiva limpiada: ${tel}`);
    }
  }
}, 60 * 60 * 1000); // Cada hora

// ============================================================
// SYSTEM PROMPT MIYU BEAUTY
// ============================================================
const SYSTEM_PROMPT = `Eres Guadalupe, asesora de ventas de Miyu Beauty, tienda de maquillaje y skincare coreano/japonés en Mazatlán, Sinaloa.

PERSONALIDAD: Eres cálida, entusiasta, conocedora de k-beauty y j-beauty. Hablas en español mexicano natural. Usas emojis con moderación. Eres honesta sobre productos y nunca presionas.

CATÁLOGO COMPLETO:
🌞 PROTECCIÓN SOLAR:
- Beauty of Joseon Relief Sun Rice + Probiotics SPF50+ PA++++ $550
- Bioré UV Aqua Rich Watery Essence SPF50+ $475

💆 CUIDADO CAPILAR:
- Mascarilla Shiseido Aqua Intensive $500
- &Honey Deep Moist Aceite Capilar $500
- CER-100 Hair Filler Ceramide Treatment $395

💄 MAQUILLAJE:
- Tirtir Cushion Mask Fit Red (varios tonos) $800
- Mascara Heroine Make Long & Curl $450
- Removedor de Maquillaje Bifásico $450
- Delineador Waterproof Ultra Fino $450
- Repuesto Rizador de Pestañas $79

🧴 SKIN CARE:
- Mascarilla de Arroz Exfoliante $550
- Centellian 24 Madeca Cream $579
- Dynasty Cream Lifting & Firming $665
- Parches de Ojos Beauty of Joseon $620
- Mixsoon Bean Eye Cream $625
- Medicube PDRN Peptide Serum $695
- Medicube Kojic Acid Serum $695
- Set Anua Heartleaf (limpiador + tónico) $720
- Mixsoon Glass Skin Kit $820

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
2. Identifica necesidades (tipo de piel, productos que busca).
3. Recomienda productos específicos con beneficios concretos.
4. Ofrece combos o complementos cuando tenga sentido.
5. Confirma total + método de pago.
6. Pide comprobante de pago para confirmar pedido.
7. Confirma pedido y tiempo de entrega (1-2 días hábiles en Mazatlán).

IMPORTANTE:
- Si alguien manda una foto de piel/rostro, analízala y recomienda productos específicos.
- Si mandan comprobante de pago, confírmalo y agradece.
- Si preguntan por algo que no tenemos, sé honesta y sugiere alternativas del catálogo.
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
    });

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

    if (modoPausa[telefono]) {
      // Guardar mensaje del cliente aunque el bot esté pausado, para que aparezca en el dashboard
      if (tipo === "text" && mensaje.text && typeof mensaje.text.body === "string") {
        if (!conversaciones[telefono]) conversaciones[telefono] = [];
        conversaciones[telefono].push({
          role: "user",
          content: mensaje.text.body,
          ts: new Date().toISOString(),
        });
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

        await enviarMensaje(telefono, respuesta);
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
    await enviarMensaje(telefono, respuesta);

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
<meta name="viewport" content="width=device-width, initial-scale=1.0">
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
    <div class="nav-btn"    id="nb-analytics" onclick="view('analytics')" title="Analíticas">📊</div>
    <div class="nav-btn"    id="nb-stock"     onclick="view('stock')"     title="Inventario">📦</div>
    <div class="nav-spacer"></div>
    <div class="nav-avatar" title="Guadalupe González">G</div>
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
      <aside class="rp" id="rp" style="display:none">
        <div class="rp-tabs">
          <div class="rp-tab on" onclick="tab('perfil',this)">Perfil</div>
          <div class="rp-tab"    onclick="tab('stock',this)">Stock</div>
          <div class="rp-tab"    onclick="tab('acciones',this)">Acciones</div>
        </div>
        <div class="rp-body" id="rp-body"></div>
      </aside>

    </div><!-- /view-chats -->

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
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(fetchChats, 3000);
}

// ══════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════
let chats = [], activo = null, filtro = 'todos', tabActual = 'perfil', busq = '';

const STOCK = [
  {n:'Beauty of Joseon Relief Sun',    sku:'BOJ-SUN',  p:550, q:8,  s:'ok'},
  {n:'Bioré UV Aqua Rich SPF50+',      sku:'BIO-UV',   p:475, q:12, s:'ok'},
  {n:'Mascarilla Capilar Shiseido',    sku:'SHI-MASK', p:500, q:5,  s:'ok'},
  {n:'&Honey Aceite Capilar',          sku:'HON-OIL',  p:500, q:3,  s:'low'},
  {n:'CER-100 Colágeno Hair',          sku:'CER-100',  p:395, q:7,  s:'ok'},
  {n:'Tirtir Red Cushion',             sku:'TIR-CUSH', p:800, q:4,  s:'low'},
  {n:'Mascara Heroine Make',           sku:'HER-MAS',  p:450, q:0,  s:'out'},
  {n:'Removedor Heroine Make',         sku:'HER-REM',  p:450, q:6,  s:'ok'},
  {n:'Delineador Heroine Make',        sku:'HER-DEL',  p:450, q:2,  s:'low'},
  {n:'Repuesto Rizador Shiseido',      sku:'SHI-RIZ',  p:79,  q:10, s:'ok'},
  {n:'Mascarilla de Arroz',            sku:'ARR-MASK', p:550, q:9,  s:'ok'},
  {n:'Centellian 24 Madeca Cream',     sku:'CEN-24',   p:579, q:5,  s:'ok'},
  {n:'Dynasty Cream BOJ',              sku:'DYN-CRM',  p:665, q:3,  s:'low'},
  {n:'Parches Ojos BOJ',               sku:'BOJ-EYE',  p:620, q:0,  s:'out'},
  {n:'Mixsoon Bean Eye Cream',         sku:'MIX-EYE',  p:625, q:4,  s:'low'},
  {n:'Medicube PDRN Serum',            sku:'MED-PDR',  p:695, q:6,  s:'ok'},
  {n:'Medicube Kojic Acid Serum',      sku:'MED-KOJ',  p:695, q:1,  s:'low'},
  {n:'Set Anua 3 pasos',               sku:'SET-ANU',  p:720, q:5,  s:'ok'},
  {n:'Mixsoon Glass Skin Kit',         sku:'MIX-KIT',  p:820, q:3,  s:'low'},
  {n:'Parches Kyusoku Biken (6pz)',    sku:'KYU-PAR',  p:120, q:15, s:'ok'},
];

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
  el.innerHTML = list.map((c,i) => \`
    <div class="chat-row \${c.id===activo?.id?'sel':''} \${!c.bot?'paused':''}"
         data-id="\${escapeHtml(c.id)}"
         onclick="selChat(this.dataset.id)"
         style="animation-delay:\${i*.04}s">
      <div class="cr-head">
        <div class="cr-name">\${escapeHtml(c.nombre)}</div>
        <div class="cr-time">activo</div>
      </div>
      <div class="cr-preview">\${escapeHtml(c.preview)}</div>
      <div class="cr-tags">
        <span class="tag \${!c.bot?'tag-human':'tag-bot'}">\${!c.bot?'⚡ humano':'🤖 bot'}</span>
        <span class="tag tag-\${c.tipo==='nuevo'?'nuevo':c.tipo==='frecuente'?'frec':'vip'}">\${escapeHtml(c.tipo)}</span>
      </div>
    </div>\`).join('');
}

// ══════════════════════════════════════════════
//  SELECT CHAT
// ══════════════════════════════════════════════
function selChat(id) {
  activo = chats.find(c => c.id === id);
  document.getElementById('rp').style.display = 'flex';
  document.getElementById('rp').style.flexDirection = 'column';
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
            <div class="msg-who">\${m.role==='bot'?'✦ MIYU':m.role==='agent'?'⚡ GUADALUPE':safeNombre.toUpperCase()}</div>
            <div class="bubble">\${escapeHtml(m.txt)}</div>
            <div class="msg-ts">\${escapeHtml(m.ts)}</div>
          </div>\`).join('')}
    </div>

    <div class="ibar">
      <div class="ibar-mode">
        <div class="pip \${c.bot?'pip-bot':'pip-human'}"></div>
        \${c.bot ? 'Bot respondiendo automáticamente — toma control para escribir' : '⚡ Estás en control · respondiendo como Guadalupe'}
      </div>
      <div class="ibar-row">
        <textarea class="ibar-input" id="ibar-txt"
          placeholder="\${c.bot?'Toma control para escribir…':'Escribe tu mensaje…'}"
          \${c.bot?'disabled':''}
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send()}"
        ></textarea>
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
    el.innerHTML = \`
      <div class="rp-section">
        <div class="rp-title">Inventario rápido</div>
        \${STOCK.slice(0,12).map(s=>\`
          <div class="stock-row">
            <span class="sn">\${escapeHtml(s.n)}</span>
            <span class="sq \${s.s}">\${s.s==='out'?'✕ Agotado':s.q+' pzs'}</span>
          </div>\`).join('')}
      </div>\`;
  } else {
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
        <div class="rp-title">Nota interna</div>
        <textarea class="note-input" placeholder="Agrega contexto sobre este cliente…"></textarea>
        <button class="btn btn-gold" style="width:100%;justify-content:center" onclick="toast('📝 Nota guardada','t-gold')">Guardar nota</button>
      </div>\`;
  }
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
  const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const wv   = [14, 9, 22, 17, 28, 38, 21];
  const wmax = Math.max(...wv);
  const total = wv.reduce((a,b)=>a+b,0);
  document.getElementById('msgs7-total').textContent = total;
  document.getElementById('chart-week').innerHTML = wv.map((v,i)=>\`
    <div class="bc-wrap">
      <div class="bc-bar \${v===Math.max(...wv)?'hi':'lo'}" style="height:\${(v/wmax)*90}%">
        <div class="bc-bar-tip">\${v} msgs</div>
      </div>
      <div class="bc-lbl">\${DAYS[i]}</div>
    </div>\`).join('');

  const FN = [
    {l:'Mensajes recibidos', v:100, c:'var(--c-gold)'},
    {l:'Mostraron interés',  v:68,  c:'var(--c-gold-lt)'},
    {l:'Pidieron precio',    v:44,  c:'var(--c-blush)'},
    {l:'Confirmaron pedido', v:19,  c:'var(--c-mint)'},
  ];
  document.getElementById('funnel').innerHTML = FN.map(f=>\`
    <div class="fn">
      <div class="fn-lbl">\${escapeHtml(f.l)}</div>
      <div class="fn-track"><div class="fn-fill" style="width:\${f.v}%;background:\${f.c}">\${f.v}%</div></div>
      <div class="fn-n">\${f.v}</div>
    </div>\`).join('');

  const DN = [
    {l:'Nuevas',    v:44, c:'#c8ab6e'},
    {l:'Frecuentes',v:30, c:'#6daa8e'},
    {l:'VIP',       v:16, c:'#c97d8e'},
    {l:'Mayoreo',   v:10, c:'#6688bb'},
  ];
  buildDonut(DN);

  const PRODS = [
    ['Set Anua 3 pasos','52'],
    ['Tirtir Red Cushion','41'],
    ['Beauty of Joseon Sun','37'],
    ['Medicube PDRN Serum','31'],
    ['Dynasty Cream','25'],
  ];
  document.getElementById('prod-tbody').innerHTML = PRODS.map((p,i)=>\`
    <tr>
      <td class="pt-rank">\${i+1}</td>
      <td>\${escapeHtml(p[0])}</td>
      <td>\${escapeHtml(p[1])}</td>
    </tr>\`).join('');

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
  const low = STOCK.filter(s=>s.s==='low').length;
  const out = STOCK.filter(s=>s.s==='out').length;
  document.getElementById('s-low').textContent = low;
  document.getElementById('s-out').textContent = out;
  document.getElementById('inv-table-wrap').innerHTML = \`
    <table class="inv-table">
      <thead><tr>
        <th>Producto</th><th>SKU</th><th>Precio</th><th>Stock</th><th style="text-align:right">Estado</th>
      </tr></thead>
      <tbody>
        \${STOCK.map(s=>\`
          <tr>
            <td>\${escapeHtml(s.n)}</td>
            <td class="sku">\${escapeHtml(s.sku)}</td>
            <td>$\${s.p}</td>
            <td class="qty-\${s.s}">\${s.q}</td>
            <td style="text-align:right"><span class="tag \${s.s==='ok'?'tag-nuevo':s.s==='low'?'tag-bot':'tag-human'}">\${s.s==='ok'?'OK':s.s==='low'?'BAJO':'AGOTADO'}</span></td>
          </tr>\`).join('')}
      </tbody>
    </table>\`;
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
function view(v) {
  ['chats','analytics','stock'].forEach(x => {
    document.getElementById(\`view-\${x}\`).classList.toggle('on', x===v);
    document.getElementById(\`nb-\${x}\`).classList.toggle('on', x===v);
  });
  if (v==='analytics') buildAnalytics();
  if (v==='stock')     buildInventory();
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
// HEALTH CHECK
// ============================================================
app.get("/", (req, res) => {
  res.send("🌸 Miyu Beauty Chatbot v2.2 activo");
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
