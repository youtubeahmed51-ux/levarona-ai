 
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
const CHAT_MODEL = 'gemini-3.8-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    aiConnected: Boolean(API_KEY),
    chatModel: CHAT_MODEL,
    imageModel: IMAGE_MODEL
  });
});

function extractText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const texts = [];
  for (const step of data?.steps || []) {
    if (step?.type !== 'model_output') continue;
    for (const item of step.content || []) {
      if (item?.type === 'text' && typeof item.text === 'string') {
        texts.push(item.text);
      }
    }
  }
  return texts.join('\n').trim();
}

async function callGemini(input) {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY is missing from hosting settings.');
  }

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        input,
        system_instruction:
          'You are Levarona, a friendly and accurate educational AI tutor. Explain clearly, adapt to the student level, and answer in the language the student uses.',
        
generation_config: {
  thinking_level: 'medium',
  max_output_tokens: 4096
},

        },
        store: false
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini error ${response.status}`);
  }

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

    const previousMessages = (Array.isArray(history) ? history : [])
      .slice(-10)
      .filter(item => item && typeof item.content === 'string')
      .map(item =>
        `${item.role === 'assistant' || item.role === 'model' ? 'Assistant' : 'Student'}: ${item.content.slice(0, 6000)}`
      )
      .join('\n\n');

    const attachmentNotes = (Array.isArray(attachments) ? attachments : [])
      .slice(0, 5)
      .filter(file => typeof file?.text === 'string' && file.text.trim())
      .map(file => `File ${file.name || ''}:\n${file.text.slice(0, 10000)}`)
      .join('\n\n');

    const prompt = [
      `You are Levarona, an educational AI tutor.`,
      `Subject: ${subject}. Student level: ${level}. Mode: ${mode}.`,
      previousMessages ? `Conversation:\n${previousMessages}` : '',
      attachmentNotes ? `Attachments:\n${attachmentNotes}` : '',
      `Student's message:\n${String(message).slice(0, 20000)}`
    ].filter(Boolean).join('\n\n');

    const data = await callGemini(prompt);
    const reply = extractText(data);

    if (!reply) throw new Error('Gemini returned an empty answer.');

    res.json({ reply });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: error.message || 'Chat request failed.' });
  }
});

app.post('/api/image', async (req, res) => {
  try {
    const { prompt = '', subject = 'General', level = 'General' } = req.body || {};

    if (!String(prompt).trim()) {
      return res.status(400).json({ error: 'Describe the image first.' });
    }
    if (!API_KEY) {
      throw new Error('GEMINI_API_KEY is missing from hosting settings.');
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Create an educational illustration. Subject: ${subject}. Student level: ${level}. Request: ${prompt}`
            }]
          }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        })
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || `Image API error ${response.status}`);
    }

    const image = (data?.candidates?.[0]?.content?.parts || [])
      .find(part => part?.inlineData?.data)?.inlineData?.data;

    if (!image) throw new Error('No image returned. Check image model access and quota.');

    res.json({ image });
  } catch (error) {
    console.error('Image error:', error.message);
    res.status(500).json({ error: error.message || 'Image generation failed.' });
  }
});

app.post('/api/word', async (req, res) => {
  try {
    const { title = 'Levarona Lesson', content = '', subject = '' } = req.body || {};

    const paragraphs = String(content).split(/\r?\n/).map(
      line => new Paragraph({ children: [new TextRun(line || ' ')] })
    );

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: String(title), heading: HeadingLevel.HEADING_1 }),
          ...(subject ? [new Paragraph({ text: `Subject: ${subject}` })] : []),
          ...paragraphs
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="Levarona_Lesson.docx"');
    res.send(buffer);
  } catch (error) {
    console.error('Word export error:', error.message);
    res.status(500).json({ error: error.message || 'Word export failed.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Levarona listening on port ${PORT}`);
});

         
