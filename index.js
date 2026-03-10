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
const fs = require("fs");

// Servir dashboard (incrustado directamente)
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MIYU Beauty — Panel de Control</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0d0a0e;
    --surface: #16111a;
    --surface2: #1f1825;
    --border: #2d2335;
    --accent: #e8a0bf;
    --accent2: #c97ab2;
    --green: #7ec8a0;
    --red: #e88080;
    --yellow: #e8d080;
    --text: #f0e8f5;
    --muted: #8a7a95;
    --online: #7ec8a0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* HEADER */
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 32px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .logo {
    font-family: 'DM Serif Display', serif;
    font-size: 22px;
    color: var(--accent);
    letter-spacing: 0.02em;
  }
  .logo span { font-style: italic; color: var(--muted); font-size: 14px; margin-left: 8px; }
  .header-stats {
    display: flex;
    gap: 24px;
  }
  .stat {
    text-align: center;
  }
  .stat-num {
    font-size: 22px;
    font-weight: 600;
    color: var(--accent);
  }
  .stat-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .status-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 100px;
    background: rgba(126, 200, 160, 0.1);
    border: 1px solid rgba(126, 200, 160, 0.3);
    font-size: 13px;
    color: var(--green);
  }
  .pulse {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--green);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }

  /* LAYOUT */
  .main {
    display: grid;
    grid-template-columns: 340px 1fr;
    height: calc(100vh - 73px);
  }

  /* SIDEBAR - LISTA DE CHATS */
  .sidebar {
    border-right: 1px solid var(--border);
    overflow-y: auto;
    background: var(--surface);
  }
  .sidebar-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .sidebar-title {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
    font-weight: 500;
  }
  .filter-tabs {
    display: flex;
    gap: 4px;
  }
  .filter-tab {
    padding: 4px 10px;
    border-radius: 100px;
    font-size: 11px;
    cursor: pointer;
    border: 1px solid var(--border);
    color: var(--muted);
    background: transparent;
    transition: all 0.2s;
  }
  .filter-tab.active {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  .chat-item {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.15s;
    position: relative;
  }
  .chat-item:hover { background: var(--surface2); }
  .chat-item.active { background: var(--surface2); border-left: 2px solid var(--accent); }
  .chat-item.paused { border-left: 2px solid var(--yellow); }

  .chat-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 4px;
  }
  .chat-name {
    font-weight: 500;
    font-size: 14px;
    color: var(--text);
  }
  .chat-time {
    font-size: 11px;
    color: var(--muted);
  }
  .chat-preview {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
  }
  .chat-tags {
    display: flex;
    gap: 4px;
    margin-top: 6px;
    flex-wrap: wrap;
  }
  .tag {
    padding: 2px 8px;
    border-radius: 100px;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .tag-bot { background: rgba(232, 160, 191, 0.15); color: var(--accent); }
  .tag-human { background: rgba(232, 208, 128, 0.15); color: var(--yellow); }
  .tag-vip { background: rgba(201, 122, 178, 0.2); color: var(--accent2); }
  .tag-nuevo { background: rgba(126, 200, 160, 0.15); color: var(--green); }
  .tag-frecuente { background: rgba(126, 160, 200, 0.15); color: #80b0e8; }
  .unread-dot {
    width: 8px; height: 8px;
    background: var(--accent);
    border-radius: 50%;
    position: absolute;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
  }

  /* PANEL PRINCIPAL */
  .chat-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .chat-panel-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--surface);
  }
  .client-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .avatar {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Serif Display', serif;
    font-size: 16px;
    color: var(--bg);
  }
  .client-name { font-weight: 500; font-size: 15px; }
  .client-phone { font-size: 12px; color: var(--muted); }
  .client-meta {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  /* BOTONES DE CONTROL */
  .control-buttons {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .btn {
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
    font-family: 'DM Sans', sans-serif;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-take {
    background: var(--yellow);
    color: #1a1500;
  }
  .btn-take:hover { background: #f0da8a; transform: translateY(-1px); }
  .btn-release {
    background: var(--green);
    color: #0a1f12;
  }
  .btn-release:hover { background: #90d8b0; transform: translateY(-1px); }
  .btn-mp {
    background: rgba(30, 167, 253, 0.15);
    color: #4fc3f7;
    border: 1px solid rgba(30, 167, 253, 0.3);
  }
  .btn-mp:hover { background: rgba(30, 167, 253, 0.25); }
  .btn-outline {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .btn-outline:hover { border-color: var(--accent); color: var(--accent); }

  /* MENSAJES */
  .messages-area {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .message {
    max-width: 65%;
    animation: fadeIn 0.3s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .message.bot { align-self: flex-start; }
  .message.user { align-self: flex-end; }
  .message.human-agent { align-self: flex-start; }

  .msg-bubble {
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13.5px;
    line-height: 1.5;
  }
  .message.bot .msg-bubble {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-bottom-left-radius: 4px;
  }
  .message.user .msg-bubble {
    background: rgba(232, 160, 191, 0.15);
    border: 1px solid rgba(232, 160, 191, 0.2);
    border-bottom-right-radius: 4px;
  }
  .message.human-agent .msg-bubble {
    background: rgba(232, 208, 128, 0.12);
    border: 1px solid rgba(232, 208, 128, 0.25);
    border-bottom-left-radius: 4px;
  }
  .msg-meta {
    font-size: 11px;
    color: var(--muted);
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .message.user .msg-meta { justify-content: flex-end; }
  .msg-sender {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 4px;
    color: var(--muted);
  }
  .message.bot .msg-sender { color: var(--accent); }
  .message.human-agent .msg-sender { color: var(--yellow); }

  /* INPUT AREA */
  .input-area {
    padding: 16px 24px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }
  .mode-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-size: 12px;
    color: var(--muted);
  }
  .mode-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
  }
  .mode-dot.bot { background: var(--accent); }
  .mode-dot.human { background: var(--yellow); }

  .input-row {
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }
  .msg-input {
    flex: 1;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    color: var(--text);
    font-family: 'DM Sans', sans-serif;
    font-size: 13.5px;
    resize: none;
    min-height: 42px;
    max-height: 120px;
    transition: border-color 0.2s;
  }
  .msg-input:focus { outline: none; border-color: var(--accent); }
  .msg-input::placeholder { color: var(--muted); }
  .send-btn {
    width: 42px; height: 42px;
    border-radius: 10px;
    background: var(--accent);
    border: none;
    color: var(--bg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    font-size: 18px;
  }
  .send-btn:hover { background: var(--accent2); transform: scale(1.05); }

  /* PANEL LATERAL DERECHO - PERFIL */
  .profile-panel {
    width: 260px;
    border-left: 1px solid var(--border);
    background: var(--surface);
    overflow-y: auto;
    padding: 20px;
    flex-shrink: 0;
  }
  .profile-section {
    margin-bottom: 20px;
  }
  .profile-section-title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .profile-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .profile-key { color: var(--muted); }
  .profile-val { color: var(--text); font-weight: 500; text-align: right; max-width: 130px; }

  /* STOCK PANEL */
  .stock-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }
  .stock-item:last-child { border-bottom: none; }
  .stock-name { color: var(--muted); max-width: 130px; }
  .stock-badge {
    padding: 2px 8px;
    border-radius: 100px;
    font-size: 11px;
    font-weight: 600;
  }
  .stock-ok { background: rgba(126, 200, 160, 0.2); color: var(--green); }
  .stock-low { background: rgba(232, 208, 128, 0.2); color: var(--yellow); }
  .stock-out { background: rgba(232, 128, 128, 0.2); color: var(--red); }

  /* TOAST */
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    z-index: 1000;
    animation: slideIn 0.3s ease, fadeOut 0.3s ease 2.7s forwards;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .toast-success { background: var(--green); color: #0a1f12; }
  .toast-warning { background: var(--yellow); color: #1a1500; }
  @keyframes slideIn {
    from { transform: translateX(100px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes fadeOut {
    to { opacity: 0; transform: translateX(100px); }
  }

  /* EMPTY STATE */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    gap: 12px;
  }
  .empty-icon { font-size: 48px; opacity: 0.3; }
  .empty-text { font-family: 'DM Serif Display', serif; font-size: 18px; color: var(--muted); }

  /* SCROLLBAR */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .chat-panel-inner {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .divider-date {
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    padding: 8px 0;
    position: relative;
  }
  .divider-date::before {
    content: '';
    position: absolute;
    left: 0; right: 0; top: 50%;
    height: 1px;
    background: var(--border);
    z-index: 0;
  }
  .divider-date span {
    background: var(--bg);
    padding: 0 12px;
    position: relative;
    z-index: 1;
  }
</style>
</head>
<body>

<header>
  <div class="logo">MIYU Beauty <span>Panel de Operaciones</span></div>
  <div class="header-stats">
    <div class="stat">
      <div class="stat-num" id="stat-activos">0</div>
      <div class="stat-label">Chats Activos</div>
    </div>
    <div class="stat">
      <div class="stat-num" id="stat-humano">0</div>
      <div class="stat-label">En Control</div>
    </div>
    <div class="stat">
      <div class="stat-num" id="stat-hoy">0</div>
      <div class="stat-label">Ventas Hoy</div>
    </div>
  </div>
  <div class="status-pill">
    <div class="pulse"></div>
    Bot Online
  </div>
</header>

<div class="main">
  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-title">Conversaciones</div>
      <div class="filter-tabs">
        <button class="filter-tab active" onclick="filtrar('todos')">Todos</button>
        <button class="filter-tab" onclick="filtrar('humano')">⚡ Humano</button>
        <button class="filter-tab" onclick="filtrar('bot')">🤖 Bot</button>
      </div>
    </div>
    <div id="chat-list"></div>
  </div>

  <!-- PANEL PRINCIPAL -->
  <div class="chat-panel" id="chat-panel">
    <div class="empty-state">
      <div class="empty-icon">🌸</div>
      <div class="empty-text">Selecciona una conversación</div>
      <div style="font-size:13px; color: var(--muted)">para ver el chat y tomar control</div>
    </div>
  </div>
</div>

<script>
// ============================================================
// CONFIGURACIÓN — cambiar por tu Railway URL
// ============================================================
const API_BASE = window.location.origin;

// ============================================================
// DATOS DEMO (reemplaza con fetch real al backend)
// ============================================================
const clientesDemo = [
  {
    id: "5216691108333",
    nombre: "Julio Torres",
    telefono: "+52 669 110 8333",
    tipo: "frecuente",
    modoBot: true,
    ultimoMensaje: "Qué tono me recomiendas para piel morena?",
    hora: "hace 2 min",
    noLeidos: 2,
    perfil: {
      tipoPiel: "Mixta",
      tono: "NC42",
      compras: 3,
      totalGastado: "$1,850 MXN",
      ultimaCompra: "Set Anua"
    },
    mensajes: [
      { tipo: "bot", texto: "¡Hola! Soy Miyu de MIYU Beauty 🌸 ¿En qué te puedo ayudar hoy?", hora: "9:01 pm" },
      { tipo: "user", texto: "Hola! busco algo para manchas y poros", hora: "9:02 pm" },
      { tipo: "bot", texto: "¡Qué bueno que nos escribiste! Para manchas y poros tengo dos opciones increíbles:\\n\\n• Medicube Kojic Acid Serum → $695 MXN (aclara manchas, controla grasa)\\n• Set Anua 3 pasos → $720 MXN (toner + serum + crema, el combo completo)\\n\\n¿Cuál te llama más la atención?", hora: "9:02 pm" },
      { tipo: "user", texto: "Qué tono me recomiendas para piel morena?", hora: "9:04 pm" }
    ]
  },
  {
    id: "5216699001234",
    nombre: "Ana Beltrán",
    telefono: "+52 669 900 1234",
    tipo: "nuevo",
    modoBot: false,
    ultimoMensaje: "Cuánto cuesta el envío a CDMX?",
    hora: "hace 8 min",
    noLeidos: 0,
    perfil: {
      tipoPiel: "Seca",
      tono: "NC20",
      compras: 0,
      totalGastado: "$0",
      ultimaCompra: "—"
    },
    mensajes: [
      { tipo: "bot", texto: "¡Hola! Soy Miyu de MIYU Beauty 🌸 ¿Qué buscas hoy?", hora: "8:55 pm" },
      { tipo: "user", texto: "Vi sus productos en Instagram", hora: "8:56 pm" },
      { tipo: "human-agent", texto: "¡Hola Ana! Soy Guadalupe, ¿te puedo ayudar a encontrar algo especial? 😊", hora: "8:57 pm" },
      { tipo: "user", texto: "Cuánto cuesta el envío a CDMX?", hora: "8:58 pm" }
    ]
  },
  {
    id: "5216691555888",
    nombre: "Karla Reyes",
    telefono: "+52 669 155 5888",
    tipo: "vip",
    modoBot: true,
    ultimoMensaje: "Perfecto, hago la transferencia ahorita",
    hora: "hace 15 min",
    noLeidos: 0,
    perfil: {
      tipoPiel: "Grasa",
      tono: "NC30",
      compras: 7,
      totalGastado: "$4,200 MXN",
      ultimaCompra: "Tirtir Cushion"
    },
    mensajes: [
      { tipo: "user", texto: "Hola! ya llegó mi pedido anterior?", hora: "8:45 pm" },
      { tipo: "bot", texto: "¡Hola Karla! Qué gusto verte de nuevo 🌸 Déjame revisar tu pedido...", hora: "8:45 pm" },
      { tipo: "bot", texto: "Tu pedido fue enviado ayer por la tarde, debería llegarte mañana. ¿Necesitas el número de guía?", hora: "8:46 pm" },
      { tipo: "user", texto: "No, gracias. También quiero el Medicube PDRN", hora: "8:47 pm" },
      { tipo: "bot", texto: "¡Perfecto! El Medicube PDRN Pink Peptide Serum está en $695 MXN. ¿Lo agrego a tu pedido?", hora: "8:48 pm" },
      { tipo: "user", texto: "Perfecto, hago la transferencia ahorita", hora: "8:50 pm" }
    ]
  }
];

const stockDemo = [
  { nombre: "Tirtir Cushion", cantidad: 8, estado: "ok" },
  { nombre: "Set Anua", cantidad: 3, estado: "low" },
  { nombre: "Beauty of Joseon Sun", cantidad: 12, estado: "ok" },
  { nombre: "Medicube PDRN", cantidad: 1, estado: "low" },
  { nombre: "Medicube Kojic", cantidad: 0, estado: "out" },
  { nombre: "Dynasty Cream", cantidad: 5, estado: "ok" },
  { nombre: "CER-100", cantidad: 6, estado: "ok" },
  { nombre: "Parches Ojos BOJ", cantidad: 4, estado: "low" }
];

// ============================================================
// ESTADO
// ============================================================
let clienteActivo = null;
let filtroActivo = "todos";

// ============================================================
// RENDER LISTA DE CHATS
// ============================================================
function renderLista() {
  const lista = document.getElementById("chat-list");
  const filtrados = clientesDemo.filter(c => {
    if (filtroActivo === "humano") return !c.modoBot;
    if (filtroActivo === "bot") return c.modoBot;
    return true;
  });

  lista.innerHTML = filtrados.map(c => \`
    <div class="chat-item \${c.id === clienteActivo?.id ? 'active' : ''} \${!c.modoBot ? 'paused' : ''}"
         onclick="seleccionarChat('\${c.id}')">
      <div class="chat-top">
        <div class="chat-name">\${c.nombre}</div>
        <div class="chat-time">\${c.hora}</div>
      </div>
      <div class="chat-preview">\${c.ultimoMensaje}</div>
      <div class="chat-tags">
        <span class="tag \${!c.modoBot ? 'tag-human' : 'tag-bot'}">\${!c.modoBot ? '⚡ Humano' : '🤖 Bot'}</span>
        <span class="tag tag-\${c.tipo}">\${c.tipo.toUpperCase()}</span>
      </div>
      \${c.noLeidos > 0 ? '<div class="unread-dot"></div>' : ''}
    </div>
  \`).join("");

  // Actualizar stats
  document.getElementById("stat-activos").textContent = clientesDemo.length;
  document.getElementById("stat-humano").textContent = clientesDemo.filter(c => !c.modoBot).length;
}

// ============================================================
// SELECCIONAR CHAT
// ============================================================
function seleccionarChat(id) {
  clienteActivo = clientesDemo.find(c => c.id === id);
  clienteActivo.noLeidos = 0;
  renderLista();
  renderPanel();
}

// ============================================================
// RENDER PANEL PRINCIPAL
// ============================================================
function renderPanel() {
  if (!clienteActivo) return;
  const c = clienteActivo;
  const esBot = c.modoBot;

  document.getElementById("chat-panel").innerHTML = \`
    <div class="chat-panel-header">
      <div class="client-info">
        <div class="avatar">\${c.nombre.charAt(0)}</div>
        <div>
          <div class="client-name">\${c.nombre}</div>
          <div class="client-phone">\${c.telefono}</div>
          <div class="client-meta">
            <span class="tag tag-\${c.tipo}">\${c.tipo.toUpperCase()}</span>
            <span class="tag \${esBot ? 'tag-bot' : 'tag-human'}">\${esBot ? '🤖 Bot activo' : '⚡ Control humano'}</span>
          </div>
        </div>
      </div>
      <div class="control-buttons">
        \${esBot ? \`
          <button class="btn btn-take" onclick="tomarControl('\${c.id}')">
            ⚡ Tomar Control
          </button>
        \` : \`
          <button class="btn btn-release" onclick="soltarBot('\${c.id}')">
            🤖 Soltar al Bot
          </button>
        \`}
        <button class="btn btn-mp" onclick="generarLinkPago('\${c.id}')">
          💳 Link de Pago
        </button>
        <button class="btn btn-outline" onclick="verPerfil()">
          👤 Perfil
        </button>
      </div>
    </div>

    <div class="chat-panel-inner">
      <div class="chat-main">
        <div class="messages-area" id="messages-area">
          <div class="divider-date"><span>Hoy</span></div>
          \${c.mensajes.map(m => \`
            <div class="message \${m.tipo}">
              <div class="msg-sender">\${m.tipo === 'bot' ? '🌸 Miyu' : m.tipo === 'human-agent' ? '⚡ Tú' : c.nombre}</div>
              <div class="msg-bubble">\${m.texto.replace(/\\n/g, '<br>')}</div>
              <div class="msg-meta">\${m.hora}</div>
            </div>
          \`).join("")}
        </div>

        <div class="input-area">
          <div class="mode-indicator">
            <div class="mode-dot \${esBot ? 'bot' : 'human'}"></div>
            \${esBot ? 'El bot está respondiendo automáticamente' : '⚡ Estás en control — el bot está pausado'}
          </div>
          <div class="input-row">
            <textarea class="msg-input" id="msg-input"
              placeholder="\${esBot ? 'El bot responde automáticamente. Toma control para escribir...' : 'Escribe tu mensaje como Guadalupe...'}"
              \${esBot ? 'disabled' : ''}
              onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();enviarMensaje()}"
            ></textarea>
            <button class="send-btn" onclick="enviarMensaje()" \${esBot ? 'disabled' : ''}>➤</button>
          </div>
        </div>
      </div>

      <div class="profile-panel">
        <div class="profile-section">
          <div class="profile-section-title">Perfil del Cliente</div>
          <div class="profile-row"><span class="profile-key">Tipo de piel</span><span class="profile-val">\${c.perfil.tipoPiel}</span></div>
          <div class="profile-row"><span class="profile-key">Tono</span><span class="profile-val">\${c.perfil.tono}</span></div>
          <div class="profile-row"><span class="profile-key">Compras</span><span class="profile-val">\${c.perfil.compras}</span></div>
          <div class="profile-row"><span class="profile-key">Total gastado</span><span class="profile-val">\${c.perfil.totalGastado}</span></div>
          <div class="profile-row"><span class="profile-key">Última compra</span><span class="profile-val">\${c.perfil.ultimaCompra}</span></div>
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Stock en tiempo real</div>
          \${stockDemo.map(s => \`
            <div class="stock-item">
              <span class="stock-name">\${s.nombre}</span>
              <span class="stock-badge stock-\${s.estado}">
                \${s.estado === 'out' ? 'Agotado' : s.cantidad + ' pzs'}
              </span>
            </div>
          \`).join("")}
        </div>
      </div>
    </div>
  \`;

  // Scroll al final
  setTimeout(() => {
    const area = document.getElementById("messages-area");
    if (area) area.scrollTop = area.scrollHeight;
  }, 50);
}

// ============================================================
// TOMAR CONTROL
// ============================================================
function tomarControl(id) {
  const c = clientesDemo.find(x => x.id === id);
  c.modoBot = false;

  // En producción: POST al backend para pausar el bot
  // fetch(\`\${API_BASE}/admin/pausar\`, { method: 'POST', body: JSON.stringify({ telefono: id }) })

  showToast("⚡ Tomaste control del chat con " + c.nombre, "warning");
  renderLista();
  renderPanel();
}

// ============================================================
// SOLTAR AL BOT
// ============================================================
function soltarBot(id) {
  const c = clientesDemo.find(x => x.id === id);
  c.modoBot = true;

  // En producción: POST al backend para reactivar el bot
  // fetch(\`\${API_BASE}/admin/reactivar\`, { method: 'POST', body: JSON.stringify({ telefono: id }) })

  showToast("🤖 Bot reactivado para " + c.nombre, "success");
  renderLista();
  renderPanel();
}

// ============================================================
// ENVIAR MENSAJE COMO HUMANO
// ============================================================
function enviarMensaje() {
  const input = document.getElementById("msg-input");
  if (!input || !input.value.trim() || clienteActivo?.modoBot) return;

  const texto = input.value.trim();
  clienteActivo.mensajes.push({ tipo: "human-agent", texto, hora: "ahora" });
  clienteActivo.ultimoMensaje = texto;
  input.value = "";

  // En producción: POST al backend para enviar vía WhatsApp
  // fetch(\`\${API_BASE}/admin/enviar\`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ telefono: clienteActivo.id, mensaje: texto })
  // })

  showToast("✓ Mensaje enviado", "success");
  renderPanel();
}

// ============================================================
// GENERAR LINK DE PAGO (Mercado Pago)
// ============================================================
function generarLinkPago(id) {
  const monto = prompt("¿Cuánto es el monto del pedido? (MXN)");
  if (!monto || isNaN(monto)) return;

  // En producción: llamar al backend que llama a Mercado Pago API
  // fetch(\`\${API_BASE}/admin/link-pago\`, {
  //   method: 'POST',
  //   body: JSON.stringify({ telefono: id, monto: parseFloat(monto), descripcion: 'Pedido MIYU Beauty' })
  // })

  const linkDemo = \`https://mpago.la/miyu-\${Date.now().toString(36)}\`;
  showToast(\`💳 Link generado: \${linkDemo}\`, "success");

  // Agregar al chat
  clienteActivo.mensajes.push({
    tipo: "human-agent",
    texto: \`💳 Aquí está tu link de pago seguro:\\n\${linkDemo}\\n\\nMonto: $\${monto} MXN\`,
    hora: "ahora"
  });
  renderPanel();
}

// ============================================================
// FILTRAR
// ============================================================
function filtrar(tipo) {
  filtroActivo = tipo;
  document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
  event.target.classList.add("active");
  renderLista();
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, tipo) {
  const t = document.createElement("div");
  t.className = \`toast toast-\${tipo}\`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ============================================================
// INIT
// ============================================================
renderLista();

// Simular nuevos mensajes cada 15 segundos
setInterval(() => {
  const rand = clientesDemo[Math.floor(Math.random() * clientesDemo.length)];
  if (rand.modoBot) {
    rand.noLeidos++;
    rand.hora = "hace 1 min";
    renderLista();
  }
}, 15000);
</script>
</body>
</html>
`;
app.get("/admin", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(DASHBOARD_HTML);
});

// Pausar bot para un número
app.post("/admin/pausar", express.json(), (req, res) => {
  const { telefono } = req.body;
  if (!telefono) return res.status(400).json({ error: "Falta telefono" });
  modoPausa[telefono] = true;
  console.log(`⚡ Bot PAUSADO para ${telefono}`);
  res.json({ ok: true, telefono, pausado: true });
});

// Reactivar bot para un número
app.post("/admin/reactivar", express.json(), (req, res) => {
  const { telefono } = req.body;
  if (!telefono) return res.status(400).json({ error: "Falta telefono" });
  delete modoPausa[telefono];
  console.log(`🤖 Bot REACTIVADO para ${telefono}`);
  res.json({ ok: true, telefono, pausado: false });
});

// Enviar mensaje como humano desde el dashboard
app.post("/admin/enviar", express.json(), async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) return res.status(400).json({ error: "Faltan datos" });
  try {
    await enviarMensaje(telefono, mensaje);
    // Guardar en historial con etiqueta de agente humano
    if (!conversaciones[telefono]) conversaciones[telefono] = [];
    conversaciones[telefono].push({ role: "assistant", content: `[Agente humano]: ${mensaje}` });
    console.log(`⚡ Mensaje humano enviado a ${telefono}: ${mensaje}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Estado de todos los chats activos
app.get("/admin/chats", (req, res) => {
  const chats = Object.keys(conversaciones).map(tel => ({
    telefono: tel,
    pausado: !!modoPausa[tel],
    mensajes: conversaciones[tel]?.length || 0,
    perfil: perfilesClientes[tel] || {},
    carrito: carritosAbandonados[tel] || null
  }));
  res.json(chats);
});

// Generar link de pago Mercado Pago
app.post("/admin/link-pago", express.json(), async (req, res) => {
  const { telefono, monto, descripcion } = req.body;
  if (!monto) return res.status(400).json({ error: "Falta monto" });

  if (!MP_ACCESS_TOKEN) {
    return res.json({ ok: false, error: "No hay MP_ACCESS_TOKEN configurado" });
  }

  try {
    const mpResp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        items: [{
          title: descripcion || "Pedido MIYU Beauty",
          quantity: 1,
          currency_id: "MXN",
          unit_price: parseFloat(monto)
        }],
        back_urls: {
          success: "https://miyuuuu.tiiny.site/",
          failure: "https://miyuuuu.tiiny.site/",
          pending: "https://miyuuuu.tiiny.site/"
        },
        auto_return: "approved",
        statement_descriptor: "MIYU Beauty"
      })
    });
    const mpData = await mpResp.json();

    if (mpData.init_point) {
      // Enviar link por WhatsApp si hay teléfono
      if (telefono) {
        await enviarMensaje(telefono,
          `💳 *Tu link de pago seguro de MIYU Beauty:*\n\n${mpData.init_point}\n\nMonto: $${monto} MXN\n\nUna vez realizado el pago te confirmamos tu pedido 🌸`
        );
      }
      res.json({ ok: true, link: mpData.init_point, id: mpData.id });
    } else {
      res.json({ ok: false, error: "No se pudo generar el link", raw: mpData });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (req, res) => res.send("🌸 Miyu Beauty Chatbot v2.1 activo"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
