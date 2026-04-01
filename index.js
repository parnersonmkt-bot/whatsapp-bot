const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Memoria de conversaciones por número de teléfono
const conversaciones = {};

// ============================================================
// CONFIGURACIÓN DE TU AGENCIA — EDITÁ ESTO
// ============================================================
const SYSTEM_PROMPT = `Sos un asistente virtual de ventas de ${process.env.COMPANY_NAME || 'la agencia'}.

INFORMACIÓN DE LA EMPRESA:
${process.env.COMPANY_INFO || 'Somos una agencia de marketing digital.'}

TU PERSONALIDAD:
- Sos amigable, cercano y profesional
- Respondés siempre en español
- Tus respuestas son cortas y claras (máximo 3 párrafos)
- Usás un tono conversacional, como si fuera WhatsApp
- No usás lenguaje técnico innecesario

TUS FUNCIONES:
1. Responder preguntas sobre los servicios de la agencia
2. Dar precios o rangos de precios cuando te los pregunten
3. Escalar a un humano cuando el cliente quiere cerrar un trato o lo pide explícitamente

CUÁNDO ESCALAR A UN HUMANO:
- Si el cliente dice que quiere contratar, cerrar, empezar o hablar con alguien
- En ese caso pedí su nombre y decile: "Perfecto, un asesor te va a contactar pronto. ¿Me das tu nombre para pasarle los datos?"
- Después de obtener el nombre, respondé: "¡Listo! Ya le avisamos a nuestro equipo. Te contactamos a la brevedad 🙌"

IMPORTANTE:
- Nunca inventes información que no está en los datos de la empresa
- Si no sabés algo, decí: "Esa consulta te la responde mejor uno de nuestros asesores, ¿querés que te conecte?"
- Siempre cerrá con una pregunta para mantener la conversación activa`;
// ============================================================

// Ruta de prueba para verificar que el servidor funciona
app.get('/', (req, res) => {
  res.send('✅ Bot de WhatsApp activo y funcionando');
});

// Webhook de Twilio — recibe mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    const mensajeEntrante = req.body.Body;
    const numeroCliente = req.body.From;

    if (!mensajeEntrante || !numeroCliente) {
      return res.status(200).send('OK');
    }

    console.log(`📩 Mensaje de ${numeroCliente}: ${mensajeEntrante}`);

    // Inicializar historial si no existe
    if (!conversaciones[numeroCliente]) {
      conversaciones[numeroCliente] = [];
    }

    // Agregar mensaje del cliente al historial
    conversaciones[numeroCliente].push({
      role: 'user',
      content: mensajeEntrante
    });

    // Limitar historial a últimos 10 mensajes para no exceder tokens
    if (conversaciones[numeroCliente].length > 10) {
      conversaciones[numeroCliente] = conversaciones[numeroCliente].slice(-10);
    }

    // Llamar a Claude
    const respuesta = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: conversaciones[numeroCliente]
    });

    const textoRespuesta = respuesta.content[0].text;

    // Agregar respuesta del bot al historial
    conversaciones[numeroCliente].push({
      role: 'assistant',
      content: textoRespuesta
    });

    console.log(`🤖 Respuesta: ${textoRespuesta}`);

    // Detectar si es un lead interesado para guardar en Airtable
    const esLead = detectarLead(mensajeEntrante);
    if (esLead) {
      await guardarLeadAirtable(numeroCliente, mensajeEntrante);
    }

    // Responder a Twilio en formato TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${textoRespuesta}</Message>
</Response>`;

    res.set('Content-Type', 'text/xml');
    res.send(twiml);

  } catch (error) {
    console.error('❌ Error:', error);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Disculpá, tuve un problema técnico. Intentá de nuevo en un momento 🙏</Message>
</Response>`;
    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  }
});

// Detectar si el cliente muestra intención de compra
function detectarLead(mensaje) {
  const palabrasClave = [
    'contratar', 'quiero empezar', 'me interesa', 'cuánto cuesta',
    'precio', 'presupuesto', 'cotización', 'quiero saber más',
    'información', 'consulta', 'quiero contratar', 'cómo empezamos'
  ];
  const mensajeLower = mensaje.toLowerCase();
  return palabrasClave.some(palabra => mensajeLower.includes(palabra));
}

// Guardar lead en Airtable
async function guardarLeadAirtable(telefono, consulta) {
  try {
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) return;

    await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Leads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          'Teléfono': telefono,
          'Consulta': consulta,
          'Fecha': new Date().toISOString(),
          'Estado': 'Nuevo'
        }
      })
    });

    console.log(`✅ Lead guardado en Airtable: ${telefono}`);
  } catch (error) {
    console.error('Error guardando en Airtable:', error);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot activo en puerto ${PORT}`);
});
