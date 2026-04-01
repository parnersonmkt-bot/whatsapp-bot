const express = require('express');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const conversaciones = {};

const SYSTEM_PROMPT = `Sos un asistente virtual de ventas de la agencia. Respondé siempre en español de forma amigable y concisa.`;

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
      parts: [{ text: mensajeEntrante }]
    });

    if (conversaciones[numeroCliente].length > 10) {
      conversaciones[numeroCliente] = conversaciones[numeroCliente].slice(-10);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    console.log('API Key existe:', !!apiKey);
    console.log('API Key primeros chars:', apiKey ? apiKey.substring(0, 10) : 'NINGUNA');

    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;

    const bodyEnviar = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: conversaciones[numeroCliente]
    };

    console.log('Llamando a Gemini...');

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyEnviar)
    });

    console.log('Status Gemini:', geminiResponse.status);

    const geminiData = await geminiResponse.json();
    console.log('Respuesta Gemini completa:', JSON.stringify(geminiData));

    const textoRespuesta = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de Gemini';

    conversaciones[numeroCliente].push({
      role: 'model',
      parts: [{ text: textoRespuesta }]
    });

    console.log('Respuesta final: ' + textoRespuesta);

    const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' + textoRespuesta + '</Message></Response>';
    res.set('Content-Type', 'text/xml');
    res.send(twiml);

  } catch (error) {
    console.error('Error completo:', error);
    const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Error tecnico.</Message></Response>';
    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Bot activo en puerto ' + PORT);
});
