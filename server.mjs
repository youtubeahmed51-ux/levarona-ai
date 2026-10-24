
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
 const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
app.get('/api/health', (_req, res) => {
  res.json({ aiConnected: Boolean(API_KEY), model: MODEL });
});

async function gemini(contents, generationConfig = {}) {
  if (!API_KEY) throw new Error('Set GEMINI_API_KEY in hosting Environment Variables.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY
    },
    body: JSON.stringify({ contents, generationConfig })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Gemini API error ${response.status}`);
  return data;
}

app.post('/api/chat', async (req, res) => {
  try {
    const {
      message = '',
      subject = 'General',
      level = 'General',
      mode = 'Tutor',
      history = [],
      attachments = []
    } = req.body || {};

    const parts = [{
      text: `You are Levarona, a friendly educational AI tutor.
Subject: ${subject}. Student level: ${level}. Mode: ${mode}.
Explain accurately and clearly, adapt to the student's level, and use the language of the student's question.
Answer unrelated questions normally.

Student message: ${message}`
    }];

    for (const file of Array.isArray(attachments) ? attachments.slice(0, 5) : []) {
      if (typeof file?.data === 'string') {
        const match = file.data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
        if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
      if (typeof file?.text === 'string') {
        parts.push({ text: `Attached file ${file.name || ''}:\n${file.text.slice(0, 15000)}` });
      }
    }

    const contents = [];
    for (const item of Array.isArray(history) ? history.slice(-10) : []) {
      if (item?.role && typeof item.content === 'string') {
        contents.push({
          role: item.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: item.content.slice(0, 6000) }]
        });
      }
    }
    contents.push({ role: 'user', parts });

    const data = await gemini(contents, { temperature: 0.5, maxOutputTokens: 1800 });
    const reply = (data.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '').join('\n').trim();

    if (!reply) throw new Error('Gemini returned an empty answer. Try again.');
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Chat request failed.' });
  }
});

app.post('/api/image', async (req, res) => {
  try {
    const { prompt = '', subject = 'General', level = 'General' } = req.body || {};
    if (!prompt.trim()) return res.status(400).json({ error: 'Describe the image first.' });
    if (!API_KEY) throw new Error('Set GEMINI_API_KEY in hosting Environment Variables.');

    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Create a clear educational illustration for ${subject}, student level ${level}. Request: ${prompt}`
          }]
        }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Image API error ${response.status}`);
    const image = (data.candidates?.[0]?.content?.parts || [])
      .find(p => p.inlineData?.data)?.inlineData?.data;

    if (!image) throw new Error('No image returned. Check image model access and quota.');
    res.json({ image });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Image generation failed.' });
  }
});

app.post('/api/word', async (req, res) => {
  try {
    const { title = 'Levarona Lesson', content = '', subject = '' } = req.body || {};
    const lines = String(content).split(/\r?\n/).map(
      line => new Paragraph({ children: [new TextRun(line || ' ')] })
    );

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: String(title), heading: HeadingLevel.HEADING_1 }),
          ...(subject ? [new Paragraph({ text: `Subject: ${subject}` })] : []),
          ...lines
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Levarona_Lesson.docx"');
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Word export failed.' });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`Levarona listening on port ${PORT}`));
         
