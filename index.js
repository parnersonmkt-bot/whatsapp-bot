const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const conversaciones = {};

const SYSTEM_PROMPT = `Sos un asistente virtual de ventas de ${process.env.COMPANY_NAME || 'la agencia'}.

INFORMACION DE LA EMPRESA:
${process.env.COMPANY_INFO || 'Somos una agencia de marketing digital.'}

TU PERSONALIDAD:
- Sos amigable, cercano y profesional
- Respondés siempre en español
- Tus respuestas son cortas y claras (máximo 3 párrafos)
- Usás un tono conversacional, como si fuera WhatsApp

TUS FUNCIONES:
1. Responder preguntas sobre los servicios de la agencia
2. Dar precios cuando te los pregunten
3. Escalar a un humano cuando el cliente quiere contratar o lo pide

CUANDO ESCALAR:
- Si el cliente quiere contratar o hablar con alguien, pedí su nombre
- Luego decile: Listo, un asesor te contacta a la brevedad.

IMPORTANTE:
- Nunca inventes info que no está en los datos de la empresa
- Si no sabés algo decí: Te lo responde mejor un asesor, te conecto?
- Siempre cerrá con una pregunta`;

app.get('/', (req, res) => {
  res.send('Bot activo');
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
      content: mensajeEntrante
    });

    if (conversaciones[numeroCliente].length > 10) {
      conversaciones[numeroCliente] = conversaciones[numeroCliente].slice(-10);
    }

    const respuesta = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: conversaciones[numeroCliente]
    });

    const textoRespuesta = respuesta.content[0].text;

    conversaciones[numeroCliente].push({
      role: 'assistant',
      content: textoRespuesta
    });

    console.log('Respuesta: ' + textoRespuesta);

    // Detectar lead y guardar en Airtable
    const palabrasClave = ['contratar','quiero empezar','me interesa','cuanto cuesta','precio','presupuesto','cotizacion','quiero contratar','interesado'];
    const mensajeLower = mensajeEntrante.toLowerCase();
    const esLead = palabrasClave.some(p => mensajeLower.includes(p));

    console.log('Es lead:', esLead, '| Mensaje lower:', mensajeLower);
    console.log('AIRTABLE_API_KEY existe:', !!process.env.AIRTABLE_API_KEY);
    console.log('AIRTABLE_BASE_ID:', process.env.AIRTABLE_BASE_ID);

    if (esLead) {
      await guardarLeadAirtable(numeroCliente, mensajeEntrante);
    }

    const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' + textoRespuesta + '</Message></Response>';
    res.set('Content-Type', 'text/xml');
    res.send(twiml);

  } catch (error) {
    console.error('Error:', error);
    const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Disculpa, tuve un problema tecnico. Intenta de nuevo en un momento.</Message></Response>';
    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  }
});

async function guardarLeadAirtable(telefono, consulta) {
  try {
    console.log('Intentando guardar lead en Airtable...');
    const url = 'https://api.airtable.com/v0/' + process.env.AIRTABLE_BASE_ID + '/Leads';
    console.log('URL Airtable:', url);

    const body = {
      fields: {
        'Telefono': telefono,
        'Consulta': consulta,
        'Fecha': new Date().toISOString(),
        'Estado': 'Nuevo'
      }
    };

    console.log('Body:', JSON.stringify(body));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.AIRTABLE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log('Respuesta Airtable status:', response.status);
    console.log('Respuesta Airtable data:', JSON.stringify(data));

  } catch (error) {
    console.error('Error Airtable:', error);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Bot activo en puerto ' + PORT);
});
