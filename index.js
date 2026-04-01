const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

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
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: mensajeEntrante }
        ]
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('Error OpenAI:', errorText);
      throw new Error('Fallo en OpenAI');
    }

    const data = await openaiResponse.json();

    const respuesta =
      data.choices?.[0]?.message?.content ||
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
