const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const conversaciones = {};

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
- En ese caso pedí su nombre y decile: Perfecto, un asesor te va a contactar pronto. Dame tu nombre para pasarle los datos.
- Después de obtener el nombre, respondé: Listo! Ya le avisamos a nuestro equipo. Te contactamos a la brevedad.

IMPORTANTE:
- Nunca inventes información que no está en los datos de la empresa
- Si no sabés algo, decí: Esa consulta te la responde mejor uno de nuestros asesores, querés que te conecte?
- Siempre cerrá con una pregunta para mantener la conversación activa`;

app.get('/', (req, res) => {
  res.send('Bot de WhatsApp activo y funcionando');
});

app.post('/webhook', async (req, res) => {
  try {
    const mensajeEntrante = req.body.Body;
    const numeroCliente = req.body.From;

    if (!mensajeEntrante || !numeroCliente) {
      return res.status(200).send('OK');
    }

    console.log('Mensaje de ' + numeroCliente + ': ' + mensajeEntrante);

    if (!conversaciones[numeroCliente]) {
      conversaciones[numeroCliente] = [];
    }

    conversaciones[numeroCliente].push({
      role: 'user',
      parts: [{ text: mensajeEntrante }]
    });

    if (conversaciones[numeroCliente].length > 10) {
      conversaciones[numeroCliente] = conversaciones[numeroCliente].slice(-10);
    }

    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY;

    const geminiResponse = await fetch(geminiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { text: SYSTEM_PROMPT + "\n\nUsuario: " + mensajeEntrante }
        ]
      }
    ]
  })
});

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Error Gemini:', errorText);
    }

    const geminiData = await geminiResponse.json();

    const textoRespuesta =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ||
      'Disculpa, no pude procesar tu consulta. Intenta de nuevo.';

    conversaciones[numeroCliente].push({
      role: 'model',
      parts: [{ text: textoRespuesta }]
    });

    console.log('Respuesta: ' + textoRespuesta);

    const palabrasClave = ['contratar','quiero empezar','me interesa','cuanto cuesta','precio','presupuesto','cotizacion','quiero saber mas','informacion','consulta'];
    const esLead = palabrasClave.some(p => mensajeEntrante.toLowerCase().includes(p));

    if (esLead && process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
      fetch('https://api.airtable.com/v0/' + process.env.AIRTABLE_BASE_ID + '/Leads', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.AIRTABLE_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            'Telefono': numeroCliente,
            'Consulta': mensajeEntrante,
            'Fecha': new Date().toISOString(),
            'Estado': 'Nuevo'
          }
        })
      }).catch(e => console.error('Airtable error:', e));
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${textoRespuesta}</Message>
</Response>`;

    res.set('Content-Type', 'text/xml');
    res.send(twiml);

  } catch (error) {
    console.error('Error:', error);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Disculpa, tuve un problema técnico. Intenta de nuevo en un momento.</Message>
</Response>`;

    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Bot activo en puerto ' + PORT);
});
