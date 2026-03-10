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
<title>MIYU Beauty — Centro de Operaciones</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet">
<style>
/* ─────────────────────────────────────────
   TOKENS
───────────────────────────────────────── */
:root {
  --c-base:    #0a0809;
  --c-surface: #111019; /* slightly cool */
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

/* Top stats strip */
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

/* Analytics scroll area */
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

/* ── Bar charts ── */
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

/* ── Donut ── */
.donut-wrap { display:flex; align-items:center; gap:18px; }
.donut-legend { display:flex; flex-direction:column; gap:8px; flex:1; }
.dl { display:flex; align-items:center; gap:8px; }
.dl-dot { width:8px; height:8px; border-radius:2px; flex-shrink:0; }
.dl-name { font-size:11.5px; color:var(--c-text2); flex:1; }
.dl-val { font-size:11.5px; color:var(--c-gold); font-weight:500; font-family:'DM Mono',monospace; }

/* ── Funnel ── */
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

/* ── Hourly ── */
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

/* ── Product table ── */
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

        <!-- Stats strip -->
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

        <!-- Charts grid -->
        <div class="an-body">
          <div class="an-h1">Análisis de Operaciones</div>
          <div class="an-sub">Datos en tiempo real · actualización cada 3 s</div>

          <div class="an-grid">

            <!-- Mensajes 7 días -->
            <div class="an-card">
              <div class="an-card-t">Mensajes · últimos 7 días <span id="msgs7-total">—</span></div>
              <div class="bar-chart" id="chart-week"></div>
            </div>

            <!-- Funnel -->
            <div class="an-card">
              <div class="an-card-t">Embudo de conversión</div>
              <div class="funnel" id="funnel"></div>
            </div>

            <!-- Donut clientes -->
            <div class="an-card">
              <div class="an-card-t">Tipos de cliente</div>
              <div class="donut-wrap">
                <svg width="96" height="96" id="donut-svg"></svg>
                <div class="donut-legend" id="donut-legend"></div>
              </div>
            </div>

            <!-- Top productos -->
            <div class="an-card">
              <div class="an-card-t">Productos más consultados</div>
              <table class="ptable">
                <thead><tr><th>#</th><th>Producto</th><th style="text-align:right">Consultas</th></tr></thead>
                <tbody id="prod-tbody"></tbody>
              </table>
            </div>

            <!-- Actividad por hora -->
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
    const r = await fetch('/admin/chats');
    const data = await r.json();
    chats = data.map(c => ({
      id:       c.telefono,
      nombre:   c.perfil?.nombre || ('+' + c.telefono),
      tel:      c.telefono,
      tipo:     classTipo(c),
      bot:      !c.pausado,
      msgs:     (c.mensajes || []).map(m => ({
        role:  m.role === 'user' ? 'user' : (m.content?.startsWith('[Agente humano]') ? 'agent' : 'bot'),
        txt:   (m.content || '').replace('[Agente humano]: ', ''),
        ts:    'hoy'
      })),
      perfil:   c.perfil || {},
      carrito:  c.carrito || null,
      preview:  preview(c.mensajes),
    }));
    renderList();
    syncStats();
    if (activo) {
      const u = chats.find(x => x.id === activo.id);
      if (u && u.msgs.length !== activo.msgs.length) { activo = u; renderCenter(); }
    }
  } catch(e) { /* servidor aún no disponible */ }
}

function classTipo(c) {
  if (c.perfil?.compras > 5) return 'vip';
  if (c.perfil?.compras > 2) return 'frecuente';
  return 'nuevo';
}
function preview(msgs) {
  if (!msgs?.length) return 'Sin mensajes aún';
  const t = msgs[msgs.length-1].content || '';
  return t.substring(0,58) + (t.length > 58 ? '…' : '');
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
  el.innerHTML = list.map((c,i) => \`
    <div class="chat-row \${c.id===activo?.id?'sel':''} \${!c.bot?'paused':''}"
         onclick="selChat('\${c.id}')" style="animation-delay:\${i*.04}s">
      <div class="cr-head">
        <div class="cr-name">\${c.nombre}</div>
        <div class="cr-time">activo</div>
      </div>
      <div class="cr-preview">\${c.preview}</div>
      <div class="cr-tags">
        <span class="tag \${!c.bot?'tag-human':'tag-bot'}">\${!c.bot?'⚡ humano':'🤖 bot'}</span>
        <span class="tag tag-\${c.tipo==='nuevo'?'nuevo':c.tipo==='frecuente'?'frec':'vip'}">\${c.tipo}</span>
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
  document.getElementById('center').innerHTML = \`
    <div class="topbar">
      <div class="tb-left">
        <div class="tb-av">\${c.nombre.charAt(0).toUpperCase()}</div>
        <div>
          <div class="tb-name">\${c.nombre}</div>
          <div class="tb-phone">\${c.tel}</div>
        </div>
        <span class="tag \${c.tipo==='vip'?'tag-vip':c.tipo==='frecuente'?'tag-frec':'tag-nuevo'}" style="margin-left:2px">\${c.tipo}</span>
        <span class="tag \${c.bot?'tag-bot':'tag-human'}">\${c.bot?'🤖 bot':'⚡ control'}</span>
      </div>
      <div class="tb-right">
        \${c.bot
          ? \`<button class="btn btn-blush" onclick="takeCtrl('\${c.id}')">⚡ Tomar Control</button>\`
          : \`<button class="btn btn-mint"  onclick="releaseBot('\${c.id}')">🤖 Soltar Bot</button>\`}
        <button class="btn btn-pay"  onclick="genLink('\${c.id}')">💳 Link de Pago</button>
        <button class="btn btn-rim"  onclick="sendCat('\${c.id}')">📋 Catálogo</button>
      </div>
    </div>

    <div class="msgs-wrap" id="msgs-wrap">
      \${!c.msgs.length
        ? \`<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--c-text3);font-size:12px">Sin mensajes todavía</div>\`
        : c.msgs.map(m => \`
          <div class="msg \${m.role}">
            <div class="msg-who">\${m.role==='bot'?'✦ MIYU':m.role==='agent'?'⚡ GUADALUPE':c.nombre.toUpperCase()}</div>
            <div class="bubble">\${m.txt}</div>
            <div class="msg-ts">\${m.ts}</div>
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
  if (tabActual === 'perfil') {
    el.innerHTML = \`
      <div class="rp-section">
        <div class="rp-title">Identificación</div>
        <div class="kv"><span class="kk">Teléfono</span><span class="vv" style="font-family:'DM Mono',monospace;font-size:11px">\${c.tel}</span></div>
        <div class="kv"><span class="kk">Tipo</span><span class="vv vv-gold">\${c.tipo.toUpperCase()}</span></div>
        <div class="kv"><span class="kk">Tipo de piel</span><span class="vv">\${c.perfil.tipoPiel||'—'}</span></div>
        <div class="kv"><span class="kk">Tono</span><span class="vv">\${c.perfil.tono||'—'}</span></div>
      </div>
      <div class="rp-section">
        <div class="rp-title">Historial de compra</div>
        <div class="kv"><span class="kk">Compras</span><span class="vv vv-gold">\${c.perfil.compras||0}</span></div>
        <div class="kv"><span class="kk">Mensajes</span><span class="vv">\${c.msgs.length}</span></div>
        <div class="kv"><span class="kk">Estado bot</span><span class="vv \${c.bot?'vv-gold':'vv-blush'}">\${c.bot?'Activo':'Pausado'}</span></div>
        <div class="kv"><span class="kk">Carrito</span><span class="vv" style="font-size:11px;max-width:130px">\${c.carrito||'—'}</span></div>
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
            <span class="sn">\${s.n}</span>
            <span class="sq \${s.s}">\${s.s==='out'?'✕ Agotado':s.q+' pzs'}</span>
          </div>\`).join('')}
      </div>\`;
  } else {
    el.innerHTML = \`
      <div class="rp-section">
        <div class="rp-title">Acciones rápidas</div>
        <button class="action-btn" onclick="genLink('\${c.id}')">💳 Generar link de pago</button>
        <button class="action-btn" onclick="sendCat('\${c.id}')">📋 Enviar catálogo</button>
        <button class="action-btn" onclick="sendBank('\${c.id}')">🏦 Enviar datos bancarios</button>
        <button class="action-btn" onclick="markVIP('\${c.id}')">★ Marcar como VIP</button>
        <button class="action-btn danger" onclick="blockTroll('\${c.id}')">🚫 Bloquear troll</button>
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

  // — Week bars —
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

  // — Funnel —
  const FN = [
    {l:'Mensajes recibidos', v:100, c:'var(--c-gold)'},
    {l:'Mostraron interés',  v:68,  c:'var(--c-gold-lt)'},
    {l:'Pidieron precio',    v:44,  c:'var(--c-blush)'},
    {l:'Confirmaron pedido', v:19,  c:'var(--c-mint)'},
  ];
  document.getElementById('funnel').innerHTML = FN.map(f=>\`
    <div class="fn">
      <div class="fn-lbl">\${f.l}</div>
      <div class="fn-track"><div class="fn-fill" style="width:\${f.v}%;background:\${f.c}">\${f.v}%</div></div>
      <div class="fn-n">\${f.v}</div>
    </div>\`).join('');

  // — Donut —
  const DN = [
    {l:'Nuevas',    v:44, c:'#c8ab6e'},
    {l:'Frecuentes',v:30, c:'#6daa8e'},
    {l:'VIP',       v:16, c:'#c97d8e'},
    {l:'Mayoreo',   v:10, c:'#6688bb'},
  ];
  buildDonut(DN);

  // — Top productos —
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
      <td>\${p[0]}</td>
      <td>\${p[1]}</td>
    </tr>\`).join('');

  // — Hourly —
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
      <span class="dl-name">\${d.l}</span>
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
            <td>\${s.n}</td>
            <td class="sku">\${s.sku}</td>
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
  await fetch('/admin/pausar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telefono:id})});
  const c=chats.find(x=>x.id===id); if(c){c.bot=false;activo=c;}
  toast('⚡ Tomaste el control','t-blush'); renderList(); renderCenter(); renderRP();
}
async function releaseBot(id) {
  await fetch('/admin/reactivar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telefono:id})});
  const c=chats.find(x=>x.id===id); if(c){c.bot=true;activo=c;}
  toast('🤖 Bot reactivado','t-mint'); renderList(); renderCenter(); renderRP();
}
async function send() {
  const el=document.getElementById('ibar-txt');
  if (!el||!el.value.trim()||activo?.bot) return;
  const txt=el.value.trim(); el.value='';
  await fetch('/admin/enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telefono:activo.id,mensaje:txt})});
  activo.msgs.push({role:'agent',txt,ts:'ahora'});
  toast('✓ Mensaje enviado','t-mint'); renderCenter();
}
async function genLink(id) {
  const m=prompt('Monto del pedido (MXN):');
  if (!m||isNaN(m)) return;
  const r=await fetch('/admin/link-pago',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telefono:id,monto:parseFloat(m),descripcion:'Pedido MIYU Beauty'})});
  const d=await r.json();
  toast(d.ok?'💳 Link enviado al cliente':'⚠ Configura MP_ACCESS_TOKEN en Railway', d.ok?'t-gold':'t-blush');
}
async function sendCat(id) {
  await fetch('/admin/enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telefono:id,mensaje:'📋 Aquí tienes nuestro catálogo completo:\\nhttps://miyuuuu.tiiny.site/\\n\\n¿Algo que te llame la atención? 🌸'})});
  toast('📋 Catálogo enviado','t-gold');
}
async function sendBank(id) {
  const msg=\`💳 *Datos para transferencia MIYU Beauty:*\\n\\n🏦 Banco: STP\\n👤 Titular: Maria Guadalupe González Miranda\\n💳 Tarjeta: 5319 9500 1011 4248\\n🔢 CLABE: 646990404045356290\\n\\n⚠️ _Estas son nuestras ÚNICAS cuentas oficiales._\`;
  await fetch('/admin/enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telefono:id,mensaje:msg})});
  toast('🏦 Datos bancarios enviados','t-gold');
}
function markVIP(id) { const c=chats.find(x=>x.id===id); if(c)c.tipo='vip'; toast('★ Marcado como VIP','t-gold'); renderList(); renderRP(); }
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
  el.className=\`toast \${cls}\`; el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3000);
}

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
fetchChats();
setInterval(fetchChats, 3000);
</script>
</body>
</html>
`;

// ============================================================
// RUTAS ADMIN
// ============================================================
app.get("/admin", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(DASHBOARD_HTML);
});

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
