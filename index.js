const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

// Prompt del bot (podés mejorarlo después)
const SYSTEM_PROMPT = `
Sos un asistente de ventas profesional.
Respondé claro, breve y amigable.
Tu objetivo es ayudar al cliente y llevarlo a una compra.
`;

app.post('/webhook', async (req, res) => {
  const mensajeEntrante = req.body.Body;
  const numeroCliente = req.body.From;

  console.log('Mensaje de:', numeroCliente);
  console.log('Texto:', mensajeEntrante);

  try {
    const geminiUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' +
      process.env.GEMINI_API_KEY;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: SYSTEM_PROMPT + "\n\nUsuario: " + mensajeEntrante
              }
            ]
          }
        ]
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Error Gemini:', errorText);
      throw new Error('Fallo en Gemini');
    }

    const data = await geminiResponse.json();

    const respuesta =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No pude responder en este momento.";

    console.log('Respuesta:', respuesta);

    res.set('Content-Type', 'text/xml');
    res.send(`
      <Response>
        <Message>${respuesta}</Message>
      </Response>
    `);

  } catch (error) {
    console.error('Error general:', error);

    res.set('Content-Type', 'text/xml');
    res.send(`
      <Response>
        <Message>Disculpa, tuve un problema técnico. Intentá de nuevo en un momento.</Message>
      </Response>
    `);
  }
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Bot de WhatsApp activo y funcionando 🚀');
});

app.listen(PORT, () => {
  console.log(`Bot activo en puerto ${PORT}`);
});
