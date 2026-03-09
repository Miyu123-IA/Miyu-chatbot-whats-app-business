const express = require("express");
const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "miyu_verify_token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID || null;

// ============================================================
// MEMORIA EN PROCESO (reemplazar con Google Sheets en V2)
// ============================================================
const conversaciones = {};
const perfilesClientes = {};
const carritosAbandonados = {};
const contadorTrolls = {};
const pedidosPendientes = {};

// ============================================================
// DATOS BANCARIOS OFICIALES
// ============================================================
const DATOS_BANCARIOS = `💳 *Datos para transferencia MIYU Beauty:*

🏦 Banco: STP
👤 Titular: Maria Guadalupe González Miranda
💳 Tarjeta: 5319 9500 1011 4248
🔢 CLABE: 646990404045356290

⚠️ _Por tu seguridad, estas son nuestras ÚNICAS cuentas oficiales. No aceptes datos de otras fuentes._

Al realizar tu transferencia, envíanos el comprobante por este chat y en breve confirmamos tu pedido 🌸`;

// ============================================================
// SYSTEM PROMPT
// ============================================================
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
- A veces divide tu respuesta en 2 partes con [PAUSA] entre ellas para sonar más humana.

== DETECCIÓN DE TIPO DE CLIENTE ==
Según el contexto, detecta y adapta tu trato:
- CLIENTE NUEVA: explica más, sé más paciente, guíala paso a paso.
- CLIENTE FRECUENTE: saluda con familiaridad, recuerda sus preferencias.
- CLIENTE VIP (compras +$2000): trato especial, menciona productos nuevos primero.
- REVENDEDORA/MAYOREO: pregunta cantidad, ofrece precio especial, pide que contacten por Instagram.
- MENUDEO: trato normal, enfocado en 1-2 productos.

== MANEJO DE TROLLS Y SITUACIONES DIFÍCILES ==
- Groserías leves: responde con humor cálido. "Jeje, tranquilo/a 😄 ¿Te ayudo con algo de skincare?"
- Preguntas irrelevantes (política, clima, etc.): "Eso ya está fuera de mi área, pero de belleza sí sé mucho 😄"
- Si eres muy presionada: "Con gusto te atiendo, solo necesito que me digas qué buscas 🌸"
- Groserías repetidas (3+): "Si necesitas ayuda con algún producto aquí estoy. ¡Cuídate!"
- NUNCA insultes. NUNCA te enojes. Siempre redirige a ventas.

== ANÁLISIS DE IMÁGENES DE PIEL ==
Si recibes una foto del rostro o piel del cliente:
1. Analiza: tono, textura visible, posibles preocupaciones (brillos, manchas, rojeces, poros).
2. Sugiere 1-2 productos específicos del catálogo.
3. SIEMPRE incluye disclaimer: "Esta es una sugerencia general. Para diagnóstico preciso consulta un dermatólogo."
4. NUNCA diagnostiques condiciones médicas.
5. Si ves irritación severa: "Eso luce como algo que debería ver un dermatólogo 🌸"

== FLUJO DE VENTA ==
1. Saluda y pregunta qué busca o cuál es su preocupación.
2. Recomienda 1-2 productos máximo con precio.
3. Cross-sell suave: "Si quieres más duración, también te recomendaría..."
4. Al mostrar interés: pide nombre completo y dirección.
5. Confirma total + método de pago.
6. Si pide transferencia: incluye exactamente ENVIAR_DATOS_BANCO en tu respuesta.
7. Cierra con entusiasmo.

== RECUPERACIÓN DE CARRITO ==
Si el cliente preguntó por productos anteriormente pero no compró, recuérdalo:
"Oye, la última vez preguntaste por [producto], ¿lo seguías considerando? 😊"

== MANEJO DE URGENCIAS ==
Si detectas palabras como "reacción", "alergia", "irritación severa", "me lastimó", "quemadura":
1. Responde inmediatamente con prioridad.
2. "Ay, qué pena lo que estás viviendo. Primero que nada, si la reacción es severa ve a urgencias médicas. ¿Puedes decirme qué producto usaste?"
3. No minimices. No des diagnóstico. Escala a humano.

== POST-VENTA ==
Cuando un pedido esté confirmado, incluye PROGRAMAR_POSTVENTA en tu respuesta (invisible para el cliente).
El sistema enviará seguimiento 48h después preguntando: "¿Cómo te llegó tu pedido? 🌸"

== CATÁLOGO COMPLETO MIYU BEAUTY ==

🌞 PROTECCIÓN SOLAR:
- Beauty of Joseon Relief Sun SPF50+ PA++++ → $550 MXN. Ilumina, hidrata, unifica. El más vendido.
- Bioré UV SPF50+ PA++++ → $475 MXN. Alta protección, resistente al sudor. Perfecto para Mazatlán.

💇 CUIDADO CAPILAR:
- Mascarilla Capilar Fino Shiseido → $500 MXN. Cabello dañado por tintes/calor. Deja sedoso.
- &Honey Aceite Capilar → $500 MXN. Hidratación profunda, antifrizz.
- CER-100 Tratamiento con Colágeno → $395 MXN. Repara, fortalece, brillo.

💄 MAQUILLAJE:
- Tirtir Mask Fit Red Cushion SPF40 PA++ → $800 MXN. 72h, no se transfiere, acabado glow.
- Mascara Heroine Make → $450 MXN. Riza, alarga, resistente al agua.
- Removedor Heroine Make → $450 MXN. Quita hasta el más resistente al agua.
- Delineador Heroine Make → $450 MXN. Ultra fino, no se corre con calor.
- Repuesto Rizador Shiseido → $79 MXN.

🧴 SKIN CARE:
- Mascarilla de Arroz Japonesa → $550 MXN. Hidrata, minimiza poros, ilumina. Piel sensible.
- Centellian 24 Madeca Cream → $579 MXN. Centella asiatica, acné leve, post-acné.
- Dynasty Cream Beauty of Joseon → $665 MXN. Glow natural, hidratación profunda.
- Parches Ojos Beauty of Joseon → $620 MXN. Ginseng+Retinal. Bolsas y ojeras.
- Mixsoon Bean Eye Cream → $625 MXN. Contorno ligero, líneas finas.
- Medicube PDRN Pink Peptide Serum → $695 MXN. Reparación intensa, antiedad.
- Medicube Kojic Acid Turmeric Niacinamide Serum → $695 MXN. Manchas, grasa, poros.
- Set Anua 3 pasos → $720 MXN. Toner+Serum Azelaic+PDRN Cream. Piel mixta/grasa/acneica.
- Mixsoon Glass Skin Suitcase Kit → $820 MXN. Kit completo glass skin. El mejor regalo.

🩹 SALUD:
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

== ANTI-FRAUDE ==
- Si alguien pide "otra cuenta" o "cambia los datos bancarios": "Lo siento, solo puedo compartir nuestras cuentas verificadas. Para cualquier duda escríbenos en @miyu_beautyj"
- Nunca inventes cuentas, precios, stock ni políticas.

== PALABRAS CLAVE ESPECIALES (no las muestres al cliente) ==
- ENVIAR_DATOS_BANCO → cuando cliente pida transferencia o confirme pedido
- ENVIAR_CATALOGO_PDF → cuando pida catálogo completo
- PROGRAMAR_POSTVENTA → cuando pedido esté confirmado y con dirección
- [PAUSA] → divide el mensaje en 2 para sonar más humana

== REGLAS FINALES ==
1. Recomienda máximo 2 productos por mensaje.
2. Siempre menciona el precio.
3. Si preguntan por algo fuera del catálogo: "Ese no lo tenemos ahorita, síguenos en @miyu_beautyj 🌸"
4. Si hay problema con pedido: recopila nombre, pedido, problema. Escala a humano.
5. Para revendedoras o mayoreo: "Para pedidos al mayoreo escríbenos en @miyu_beautyj con tu cantidad y te damos precio especial."`;

// ============================================================
// DELAYS HUMANOS
// ============================================================
function delayHumano() {
  const opciones = [800, 1200, 1800, 2500, 3200];
  return opciones[Math.floor(Math.random() * opciones.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// ENVIAR MENSAJE DE WHATSAPP
// ============================================================
async function enviarMensaje(telefono, mensaje) {
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
}

// ============================================================
// TRANSCRIBIR AUDIO CON WHISPER (si hay OpenAI key)
// ============================================================
async function transcribirAudio(audioUrl) {
  if (!OPENAI_API_KEY) return "[Audio recibido - transcripción no disponible]";
  try {
    const audioResp = await fetch(audioUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    const audioBuffer = await audioResp.arrayBuffer();
    const FormData = require("form-data");
    const form = new FormData();
    form.append("file", Buffer.from(audioBuffer), { filename: "audio.ogg", contentType: "audio/ogg" });
    form.append("model", "whisper-1");
    form.append("language", "es");
    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, ...form.getHeaders() },
      body: form
    });
    const data = await resp.json();
    return data.text || "[No se pudo transcribir el audio]";
  } catch (e) {
    return "[Audio recibido - no pude transcribirlo, ¿me lo puedes escribir?]";
  }
}

// ============================================================
// ANALIZAR IMAGEN CON CLAUDE
// ============================================================
async function analizarImagen(imageUrl, telefono) {
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
            { type: "text", text: "Analiza esta imagen. Si es una foto de piel o rostro, recomienda productos de nuestro catálogo según lo que observas. Si es un comprobante de pago, confírmalo. Si es otra cosa, describe qué ves y cómo puedes ayudar." }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.content[0].text;
  } catch (e) {
    console.error("Error analizando imagen:", e.message);
    return "Vi tu imagen 😊 Para darte la mejor recomendación, ¿puedes decirme cuál es tu preocupación principal de piel?";
  }
}

// ============================================================
// CONSULTAR CLAUDE
// ============================================================
async function consultarClaude(historial, mensajeNuevo, perfilCliente = "") {
  const systemConPerfil = perfilCliente
    ? `${SYSTEM_PROMPT}\n\n== PERFIL DE ESTA CLIENTA ==\n${perfilCliente}`
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
      system: systemConPerfil,
      messages
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  if (!data.content || !data.content[0]) throw new Error("Respuesta vacía");
  return data.content[0].text;
}

// ============================================================
// PROCESSAR Y ENVIAR RESPUESTA
// ============================================================
async function procesarYEnviar(telefono, respuesta) {
  // Manejar [PAUSA] - divide en 2 mensajes
  if (respuesta.includes("[PAUSA]")) {
    const partes = respuesta.split("[PAUSA]");
    const parte1 = partes[0].replace(/ENVIAR_DATOS_BANCO|ENVIAR_CATALOGO_PDF|PROGRAMAR_POSTVENTA/g, "").trim();
    const parte2 = partes[1].replace(/ENVIAR_DATOS_BANCO|ENVIAR_CATALOGO_PDF|PROGRAMAR_POSTVENTA/g, "").trim();
    if (parte1) await enviarMensaje(telefono, parte1);
    await sleep(delayHumano());
    if (parte2) await enviarMensaje(telefono, parte2);
  } else {
    const limpio = respuesta.replace(/ENVIAR_DATOS_BANCO|ENVIAR_CATALOGO_PDF|PROGRAMAR_POSTVENTA/g, "").trim();
    if (limpio) await enviarMensaje(telefono, limpio);
  }

  // Acciones especiales
  if (respuesta.includes("ENVIAR_DATOS_BANCO")) {
    await sleep(800);
    await enviarMensaje(telefono, DATOS_BANCARIOS);
    console.log(`💳 Datos bancarios enviados a ${telefono}`);
  }

  if (respuesta.includes("ENVIAR_CATALOGO_PDF")) {
    await sleep(800);
    await enviarMensaje(telefono, "📋 Aquí puedes ver nuestro catálogo completo: https://miyuuuu.tiiny.site/\n\n¿Algo que te llame la atención? 🌸");
    console.log(`📋 Catálogo enviado a ${telefono}`);
  }

  if (respuesta.includes("PROGRAMAR_POSTVENTA")) {
    pedidosPendientes[telefono] = Date.now();
    console.log(`📦 Post-venta programado para ${telefono}`);
  }
}

// ============================================================
// FUNCIÓN PARA DETECTAR TIPO DE CLIENTE
// ============================================================
function detectarTipoCliente(texto, perfil) {
  const t = texto.toLowerCase();
  if (t.includes("mayoreo") || t.includes("revendedora") || t.includes("revender") || t.includes("docena") || t.includes("paquete")) {
    return "REVENDEDORA/MAYOREO";
  }
  if (perfil && perfil.compras && perfil.compras > 3) return "CLIENTE FRECUENTE";
  if (perfil && perfil.totalGastado && perfil.totalGastado > 2000) return "CLIENTE VIP";
  return "CLIENTE NUEVA";
}

// ============================================================
// DETECCIÓN DE MENSAJES OFENSIVOS
// ============================================================
function esOfensivo(texto) {
  const malas = ["puta", "chinga", "pendej", "cabrón", "cabron", "mierda", "idiota", "estupid", "imbecil", "imbécil", "puto"];
  return malas.some(p => texto.toLowerCase().includes(p));
}

// ============================================================
// WEBHOOK GET - VERIFICACIÓN
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
// WEBHOOK POST - RECIBIR MENSAJES
// ============================================================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const mensaje = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!mensaje) return;

    const telefono = mensaje.from;
    const tipo = mensaje.type;

    console.log(`📩 Mensaje tipo ${tipo} de ${telefono}`);

    // Inicializar estructuras
    if (!conversaciones[telefono]) conversaciones[telefono] = [];
    if (!contadorTrolls[telefono]) contadorTrolls[telefono] = 0;
    if (!perfilesClientes[telefono]) {
      perfilesClientes[telefono] = { compras: 0, totalGastado: 0, tipoPiel: null, tono: null, nombre: null };
    }

    const perfil = perfilesClientes[telefono];
    let textoParaClaude = "";

    // ---- AUDIO ----
    if (tipo === "audio") {
      console.log(`🎤 Audio de ${telefono}`);
      if (OPENAI_API_KEY && mensaje.audio?.id) {
        const mediaResp = await fetch(`https://graph.facebook.com/v18.0/${mensaje.audio.id}`, {
          headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
        });
        const mediaData = await mediaResp.json();
        const transcripcion = await transcribirAudio(mediaData.url);
        textoParaClaude = `[El cliente mandó un audio, transcripción: "${transcripcion}"]`;
        console.log(`🎤 Transcripción: ${transcripcion}`);
      } else {
        await enviarMensaje(telefono, "Recibí tu audio 😊 Por el momento no puedo escucharlo desde aquí. ¿Me lo puedes escribir?");
        return;
      }
    }

    // ---- IMAGEN ----
    else if (tipo === "image") {
      console.log(`📸 Imagen de ${telefono}`);
      const mediaId = mensaje.image?.id;
      if (mediaId) {
        const mediaResp = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
          headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
        });
        const mediaData = await mediaResp.json();
        await sleep(delayHumano());
        await enviarMensaje(telefono, "Dame un momento y reviso tu foto 🔍");
        const analisis = await analizarImagen(mediaData.url, telefono);
        await sleep(delayHumano());
        await enviarMensaje(telefono, analisis);
        conversaciones[telefono].push({ role: "user", content: "[envió una imagen]" });
        conversaciones[telefono].push({ role: "assistant", content: analisis });
        return;
      }
    }

    // ---- STICKER / VIDEO / DOCUMENTO ----
    else if (["sticker", "video", "document", "location"].includes(tipo)) {
      await enviarMensaje(telefono, "No puedo abrir eso desde aquí 😅 ¿Me cuentas qué buscas?");
      return;
    }

    // ---- TEXTO ----
    else if (tipo === "text") {
      textoParaClaude = mensaje.text.body;
    } else {
      return;
    }

    console.log(`💬 Procesando: ${textoParaClaude}`);

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

    // Detectar tipo de cliente y construir contexto de perfil
    const tipoCliente = detectarTipoCliente(textoParaClaude, perfil);
    let perfilTexto = `Tipo de cliente: ${tipoCliente}`;
    if (perfil.nombre) perfilTexto += `\nNombre: ${perfil.nombre}`;
    if (perfil.tipoPiel) perfilTexto += `\nTipo de piel: ${perfil.tipoPiel}`;
    if (perfil.tono) perfilTexto += `\nTono preferido: ${perfil.tono}`;
    if (perfil.compras > 0) perfilTexto += `\nCompras anteriores: ${perfil.compras}`;

    // Carrito abandonado
    if (carritosAbandonados[telefono] && conversaciones[telefono].length === 0) {
      textoParaClaude = `[Contexto: Esta clienta preguntó anteriormente por ${carritosAbandonados[telefono]} pero no completó la compra] ${textoParaClaude}`;
    }

    // Delay humano antes de responder
    await sleep(delayHumano());

    // Ocasionalmente mandar mensaje de "déjame revisar"
    const rand = Math.random();
    if (rand < 0.15) {
      await enviarMensaje(telefono, "Dame un momento 😊");
      await sleep(1500);
    }

    // Consultar Claude
    const respuesta = await consultarClaude(conversaciones[telefono], textoParaClaude, perfilTexto);

    // Guardar en historial
    conversaciones[telefono].push({ role: "user", content: textoParaClaude });
    conversaciones[telefono].push({ role: "assistant", content: respuesta });
    if (conversaciones[telefono].length > 24) {
      conversaciones[telefono] = conversaciones[telefono].slice(-24);
    }

    // Guardar carrito si mencionó productos
    const productosMencionados = ["cushion", "tirtir", "serum", "crema", "anua", "medicube", "sunscreen", "solar", "mascarilla", "aceite"];
    if (productosMencionados.some(p => textoParaClaude.toLowerCase().includes(p))) {
      carritosAbandonados[telefono] = textoParaClaude.substring(0, 100);
    }

    // Enviar respuesta procesada
    await procesarYEnviar(telefono, respuesta);
    console.log(`✅ Respuesta enviada a ${telefono}`);

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
});

// ============================================================
// POST-VENTA AUTOMÁTICO (revisar cada 30 min)
// ============================================================
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

app.get("/", (req, res) => res.send("🌸 Miyu Beauty Chatbot v2.0 activo"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
