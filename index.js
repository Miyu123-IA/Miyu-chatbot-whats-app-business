const express = require("express");
const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "miyu2026";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;

const conversaciones = {};
const perfilesClientes = {};
const carritosAbandonados = {};
const contadorTrolls = {};
const pedidosPendientes = {};

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
  } catch (e) {
    console.error("Error enviando mensaje:", e.message);
  }
}

async function transcribirAudio(audioBuffer) {
  if (!OPENAI_API_KEY) return null;
  try {
    const https = require("https");
    const buf = Buffer.from(audioBuffer);

    // Construir multipart/form-data manualmente sin dependencias
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

    console.log("Whisper body size:", body.length, "bytes");

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
          console.log("Whisper status:", res.statusCode, "respuesta:", data.substring(0, 300));
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error("JSON invalido: " + data.substring(0, 100))); }
        });
      });
      req.on("error", e => { console.error("Whisper error:", e.message); reject(e); });
      req.on("timeout", () => { req.destroy(); reject(new Error("Timeout Whisper 30s")); });
      req.write(body);
      req.end();
    });

    if (result.text) {
      console.log("Transcripcion exitosa:", result.text);
      return result.text;
    } else {
      console.error("Whisper sin texto:", JSON.stringify(result));
      return null;
    }
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

// Limpia TODAS las palabras clave internas del texto visible
function limpiarTexto(texto) {
  return texto
    .replace(/@@PAUSA@@/g, "")
    .replace(/\[PAUSA\]/gi, "")
    .replace(/\(PAUSA\)/gi, "")
    .replace(/@@DATOS_BANCO@@/g, "")
    .replace(/@@CATALOGO@@/g, "")
    .replace(/@@POSTVENTA@@/g, "")
    .replace(/ENVIAR_DATOS_BANCO/g, "")
    .replace(/ENVIAR_CATALOGO_PDF/g, "")
    .replace(/PROGRAMAR_POSTVENTA/g, "")
    .trim();
}

async function procesarYEnviar(telefono, respuesta) {
  // Detectar y manejar pausa - divide en 2 mensajes
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

  // Acciones especiales
  if (respuesta.includes("@@DATOS_BANCO@@") || respuesta.includes("ENVIAR_DATOS_BANCO")) {
    await sleep(800);
    await enviarMensaje(telefono, DATOS_BANCARIOS);
    console.log(`💳 Datos bancarios enviados a ${telefono}`);
  }

  if (respuesta.includes("@@CATALOGO@@") || respuesta.includes("ENVIAR_CATALOGO_PDF")) {
    await sleep(800);
    await enviarMensaje(telefono, "📋 Aquí puedes ver nuestro catálogo completo:\nhttps://miyuuuu.tiiny.site/\n\n¿Algo que te llame la atención? 🌸");
    console.log(`📋 Catálogo enviado a ${telefono}`);
  }

  if (respuesta.includes("@@POSTVENTA@@") || respuesta.includes("PROGRAMAR_POSTVENTA")) {
    pedidosPendientes[telefono] = Date.now();
    console.log(`📦 Post-venta programado para ${telefono}`);
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
  if (perfil && perfil.totalGastado > 2000) return "CLIENTE VIP";
  return "CLIENTE NUEVA";
}

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

    // Si el bot está pausado para este número, ignorar
    if (modoPausa[telefono]) {
      console.log(`⚡ Bot pausado para ${telefono} — intervención humana activa`);
      return;
    }

    if (!conversaciones[telefono]) conversaciones[telefono] = [];
    if (!contadorTrolls[telefono]) contadorTrolls[telefono] = 0;
    if (!perfilesClientes[telefono]) {
      perfilesClientes[telefono] = { compras: 0, totalGastado: 0, tipoPiel: null, tono: null, nombre: null };
    }

    const perfil = perfilesClientes[telefono];
    let textoParaClaude = "";

    // AUDIO
    if (tipo === "audio") {
      const audioId = mensaje.audio?.id;
      console.log(`🎤 Audio ID: ${audioId}, OpenAI Key presente: ${!!OPENAI_API_KEY}`);
      if (OPENAI_API_KEY && audioId) {
        try {
          await enviarMensaje(telefono, "Dame un momento, escucho tu audio 🎤");

          // Paso 1: obtener URL del audio desde Meta
          console.log(`🎤 Obteniendo URL de Meta para audio ${audioId}...`);
          const mediaResp = await fetch(`https://graph.facebook.com/v18.0/${audioId}`, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
          });
          const mediaData = await mediaResp.json();
          console.log(`🎤 Respuesta Meta:`, JSON.stringify(mediaData));

          if (!mediaData.url) {
            console.error("🎤 No se obtuvo URL del audio:", mediaData);
            await enviarMensaje(telefono, "No pude obtener el audio 😅 ¿Me lo puedes escribir?");
            return;
          }

          // Paso 2: descargar el audio con el token
          console.log(`🎤 Descargando audio de: ${mediaData.url}`);
          const audioResp = await fetch(mediaData.url, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
          });

          if (!audioResp.ok) {
            console.error(`🎤 Error descargando audio: ${audioResp.status} ${audioResp.statusText}`);
            await enviarMensaje(telefono, "No pude descargar el audio 😅 ¿Me lo puedes escribir?");
            return;
          }

          const audioBuffer = await audioResp.arrayBuffer();
          console.log(`🎤 Audio descargado, tamaño: ${audioBuffer.byteLength} bytes`);

          // Paso 3: transcribir con Whisper usando la función dedicada
          console.log(`🎤 Enviando a Whisper...`);
          const transcripcion = await transcribirAudio(audioBuffer);

          if (transcripcion) {
            console.log(`🎤 Transcripcion exitosa: ${transcripcion}`);
            textoParaClaude = `[El cliente mando un audio. Transcripcion: "${transcripcion}"]`;
          } else {
            await enviarMensaje(telefono, "No pude entender bien el audio 😅 ¿Me lo puedes escribir?");
            return;
          }
        } catch (audioError) {
          console.error("🎤 Error completo procesando audio:", audioError.message, audioError.stack);
          await enviarMensaje(telefono, "Tuve un problema con el audio 😅 ¿Me lo puedes escribir?");
          return;
        }
      } else {
        console.log(`🎤 Sin OpenAI key o sin audioId. Key: ${!!OPENAI_API_KEY}, ID: ${audioId}`);
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
        conversaciones[telefono].push({ role: "user", content: "[envió una imagen]" });
        conversaciones[telefono].push({ role: "assistant", content: analisisLimpio });
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
    } else {
      return;
    }

    console.log(`💬 Texto para Claude: ${textoParaClaude}`);

    // Detección de ofensivos
    if (esOfensivo(textoParaClaude)) {
      contadorTrolls[telefono]++;
      if (contadorTrolls[telefono] >= 3) {
        await enviarMensaje(telefono, "Si necesitas ayuda con algún producto aquí estoy 🌸 ¡Cuídate!");
        conversaciones[telefono] = [];
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
    if (perfil.tipoPiel) perfilTexto += `\nTipo de piel: ${perfil.tipoPiel}`;
    if (perfil.tono) perfilTexto += `\nTono preferido: ${perfil.tono}`;
    if (perfil.compras > 0) perfilTexto += `\nCompras anteriores: ${perfil.compras}`;

    // Carrito abandonado
    if (carritosAbandonados[telefono] && conversaciones[telefono].length === 0) {
      textoParaClaude = `[Contexto: Esta clienta preguntó antes por "${carritosAbandonados[telefono]}" pero no completó la compra] ${textoParaClaude}`;
    }

    // Delay humano
    await sleep(delayHumano());

    // Ocasionalmente mandar "dame un momento" (15% de probabilidad)
    if (Math.random() < 0.15) {
      await enviarMensaje(telefono, "Dame un momento 😊");
      await sleep(1500);
    }

    // Consultar Claude
    const respuesta = await consultarClaude(conversaciones[telefono], textoParaClaude, perfilTexto);
    console.log(`🤖 Respuesta Claude: ${respuesta.substring(0, 100)}...`);

    // Guardar historial
    conversaciones[telefono].push({ role: "user", content: textoParaClaude });
    conversaciones[telefono].push({ role: "assistant", content: respuesta });
    if (conversaciones[telefono].length > 24) {
      conversaciones[telefono] = conversaciones[telefono].slice(-24);
    }

    // Guardar carrito si mencionó productos
    const productosMencionados = ["cushion", "tirtir", "serum", "crema", "anua", "medicube", "solar", "mascarilla", "aceite", "parche", "delineador", "mascara"];
    if (productosMencionados.some(p => textoParaClaude.toLowerCase().includes(p))) {
      carritosAbandonados[telefono] = textoParaClaude.substring(0, 80);
    }

    await procesarYEnviar(telefono, respuesta);
    console.log(`✅ Respuesta enviada a ${telefono}`);

  } catch (error) {
    console.error("❌ Error general:", error.message);
  }
});

// POST-VENTA automático cada 30 min
setInterval(async () => {
  const ahora = Date.now();
  const HORAS_48 = 48 * 60 * 60 * 1000;
  for (const [telefono, timestamp] of Object.entries(pedidosPendientes)) {
    if (ahora - timestamp >= HORAS_48) {
      try {
        await enviarMensaje(telefono, "¡Hola! 😊 ¿Cómo llegó tu pedido de MIYU Beauty? Espero que todo haya estado perfecto. Si tienes alguna duda o quieres dejarnos una reseña, aquí estamos 🌸");
        delete pedidosPendientes[telefono];
        console.log(`⭐ Post-venta enviado a ${telefono}`);
      } catch (e) {
        console.error("Error post-venta:", e.message);
      }
    }
  }
}, 30 * 60 * 1000);


// ============================================================
// MODO PAUSA POR USUARIO — para intervención humana
// ============================================================
const modoPausa = {};

// ============================================================
// RUTAS DEL DASHBOARD
// ============================================================
const path = require("path");

// Servir dashboard.html desde /public/
app.use("/admin", require("express").static(path.join(__dirname, "public")));

app.post("/admin/pausar", (req, res) => {
  const { telefono } = req.body;
  if (telefono) modoPausa[telefono] = true;
  res.json({ ok: true });
});

app.post("/admin/reactivar", (req, res) => {
  const { telefono } = req.body;
  if (telefono) modoPausa[telefono] = false;
  res.json({ ok: true });
});

app.post("/admin/enviar", async (req, res) => {
  const { telefono, mensaje } = req.body;
  try {
    await enviarMensaje(telefono, `[Agente humano]: ${mensaje}`);
    if (historial[telefono]) {
      historial[telefono].push({ role: "assistant", content: `[Agente humano]: ${mensaje}` });
    }
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.get("/admin/chats", (req, res) => {
  const result = Object.entries(historial).map(([tel, msgs]) => ({
    telefono: tel,
    mensajes: msgs,
    pausado: modoPausa[tel] || false,
    perfil: perfilesClientes[tel] || {},
    carrito: carritoAbandono[tel]?.productos || null,
  }));
  res.json(result);
});

app.post("/admin/link-pago", async (req, res) => {
  const { telefono, monto, descripcion } = req.body;
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return res.json({ ok: false, error: "MP_ACCESS_TOKEN no configurado" });
  try {
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        items: [{ title: descripcion || "Pedido MIYU Beauty", quantity: 1, unit_price: monto, currency_id: "MXN" }],
        back_urls: { success: "https://miyuuuu.tiiny.site" },
        auto_return: "approved",
      })
    });
    const mpData = await mpRes.json();
    const link = mpData.init_point;
    if (link) {
      await enviarMensaje(telefono, `💳 Tu link de pago seguro:\n${link}\n\n_Válido por 30 minutos_`);
      res.json({ ok: true, link });
    } else {
      res.json({ ok: false, error: "No se pudo generar el link" });
    }
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// RUTAS FINALES
// ============================================================
app.get("/", (req, res) => res.send("🌸 Miyu Beauty Chatbot v2.1 activo"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
