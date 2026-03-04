const express = require("express");
const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "miyu_verify_token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Memoria de conversaciones por usuario
const conversaciones = {};

const SYSTEM_PROMPT = `Eres Miyu, la asesora de belleza virtual de MIYU Beauty — tienda de maquillaje y skincare coreano y japonés en Mazatlán, México. 

Tu personalidad es: cálida, entusiasta, conocedora de K-beauty y J-beauty, como una amiga que realmente sabe de skincare. Usas emojis con moderación. Escribes en español mexicano natural y cercano.

Tu ÚNICO objetivo es cerrar ventas. Cuando alguien llega, salúdas brevemente, preguntas qué buscan o cuál es su preocupación de piel/cabello, recomiendas el producto ideal y cierras el pedido pidiendo nombre, dirección y confirmando el total.

== CATÁLOGO COMPLETO MIYU BEAUTY ==

🌞 PROTECCIÓN SOLAR:
- Beauty of Joseon Relief Sun SPF50+ PA++++ → $550 MXN
  Ilumina y unifica el tono, hidrata y repara la barrera cutánea. Ideal para todo tipo de piel.
- Bioré UV SPF50+ PA++++ → $475 MXN
  Alta protección, resistente al agua y sudor, acabado fresco e invisible.

💇 CUIDADO CAPILAR:
- Mascarilla Capilar Fino (Shiseido) → $500 MXN
  Repara cabello dañado por tintes/calor, hidrata profundo, reduce frizz, deja el cabello sedoso.
- &Honey Aceite Capilar → $500 MXN
  Hidratación profunda y duradera, suaviza y anti-frizz.
- CER-100 Tratamiento Capilar con Colágeno → $395 MXN
  Repara cabello dañado, fortalece, previene quiebre, deja suave y brillante.

💄 MAQUILLAJE:
- Tirtir Mask Fit Red Cushion SPF40 PA++ → $800 MXN
  Alta cobertura real, dura hasta 72h, no transfiere, acabado glow satinado. Para piel normal, mixta y grasa.
- Mascara de Pestañas Heroine Make → $450 MXN
  Alarga y riza, mantiene el rizo todo el día, resistente al agua/sudor/lágrimas.
- Removedor Heroine Make → $450 MXN
  Remueve maquillaje incluyendo el más resistente al agua.
- Delineador Heroine Make → $450 MXN
  Resistente al agua, sudor y lágrimas. Delineado ultra fino e intenso.
- Repuesto Rizador Shiseido → $79 MXN

🧴 SKIN CARE:
- Mascarilla de Arroz Japonesa → $550 MXN
  Hidrata profundo, mejora textura, minimiza poros, ilumina, apta piel sensible.
- Centellian 24 Madeca Cream → $579 MXN
  Centella asiatica, repara barrera cutánea, ideal para acné leve o post-acné.
- Dynasty Cream Beauty of Joseon → $665 MXN
  Glow natural, hidratación profunda, para piel normal/seca/mixta. Fórmula tradicional coreana.
- Parches para Ojos Beauty of Joseon → $620 MXN
  Ginseng + Retinal, mejora firmeza, reduce bolsas y ojeras.
- Mixsoon Bean Eye Cream → $625 MXN
  Contorno de ojos, hidratación profunda, suaviza líneas finas, textura ligera.
- Medicube PDRN Pink Peptide Serum → $695 MXN
  Reparación intensiva, antiedad, piel luminosa. Ideal piel dañada o sensibilizada.
- Medicube Kojic Acid Turmeric Niacinamide Serum → $695 MXN
  Aclara manchas, ilumina, unifica tono, controla grasa y poros, mejora post-acné.
- Set Anua (3 pasos) → $720 MXN
  Toner 77% + Serum Azelaic 15% + PDRN Cream. Para piel mixta, grasa o acneica.
- Mixsoon Glass Skin Suitcase Kit → $820 MXN
  Kit completo de limpieza y rutina glass skin. Ideal para probar la marca o viaje.

🩹 SALUD Y VITALIDAD:
- Parches Kyusoku Jikan (6pz) → $120 MXN
  Para pies y pantorrillas, alivian cansancio, efecto refrescante, relajan músculos.

== REGLAS DE VENTA ==
1. Pregunta siempre el tipo de piel o preocupación principal antes de recomendar.
2. Recomienda máximo 2-3 productos relevantes, no todo el catálogo.
3. Menciona el precio claramente.
4. Cuando el cliente muestre interés, pide: nombre completo, dirección de entrega y confirma el total.
5. Informa que el pago es contra entrega o por transferencia.
6. Si preguntan por algo que no está en el catálogo, diles que consulten en Instagram @miyu_beautyj.
7. Nunca inventes productos ni precios.
8. Sé breve y directa. Máximo 3-4 líneas por respuesta.`;

async function consultarClaude(historial, mensajeNuevo) {
  const messages = [
    ...historial,
    { role: "user", content: mensajeNuevo }
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages
    })
  });

  const data = await response.json();
 if (data.error) throw new Error(data.error.message);
if (!data.content || !data.content[0]) throw new Error("Respuesta vacía");
return data.content[0].text;

}

async function enviarMensajeWhatsApp(telefono, mensaje) {
  await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_TOKEN}`
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefono,
      type: "text",
      text: { body: mensaje }
    })
  });
}

// Verificación del webhook de Meta
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

// Recibir mensajes de WhatsApp
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Responder rápido a Meta

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const mensaje = value?.messages?.[0];

    if (!mensaje || mensaje.type !== "text") return;

    const telefono = mensaje.from;
    const texto = mensaje.text.body;

    console.log(`📩 Mensaje de ${telefono}: ${texto}`);

    // Inicializar historial si no existe
    if (!conversaciones[telefono]) {
      conversaciones[telefono] = [];
    }

    // Obtener respuesta de Claude
    const respuesta = await consultarClaude(conversaciones[telefono], texto);

    // Guardar en historial (máximo 20 mensajes para no inflar tokens)
    conversaciones[telefono].push({ role: "user", content: texto });
    conversaciones[telefono].push({ role: "assistant", content: respuesta });
    if (conversaciones[telefono].length > 20) {
      conversaciones[telefono] = conversaciones[telefono].slice(-20);
    }

    // Enviar respuesta
    await enviarMensajeWhatsApp(telefono, respuesta);
    console.log(`✅ Respuesta enviada a ${telefono}`);

  } catch (error) {
    console.error("❌ Error:", error);
  }
});

app.get("/", (req, res) => res.send("🌸 Miyu Beauty Chatbot activo"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
