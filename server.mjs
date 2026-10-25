 import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const API_KEY = (process.env.GEMINI_API_KEY || '').trim();

// تنظيف وتثبيت اسم الموديل لمنع أي خطأ في الرابط
const CHAT_MODEL = (process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim();
const IMAGE_MODEL = (process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image').trim();

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
  if (Array.isArray(data?.steps)) {
    for (const step of data.steps) {
      if (step?.type !== 'model_output') continue;
      if (Array.isArray(step.content)) {
        for (const item of step.content) {
          if (item?.type === 'text' && typeof item.text === 'string') {
            texts.push(item.text);
          }
        }
      }
    }
  }

  if (texts.length === 0 && Array.isArray(data?.candidates)) {
    for (const candidate of data.candidates) {
      const parts = candidate?.content?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (typeof part?.text === 'string') {
            texts.push(part.text);
          }
        }
      }
    }
  }

  return texts.join('\n').trim();
}

async function callGemini(promptText) {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY is missing from hosting settings.');
  }

  const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${API_KEY}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini API error (Status ${response.status})`);
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('The request took too long and timed out. Please try a simpler question.');
    }
    throw error;
  }
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

    const effectiveSubject = (!subject || subject === 'General') ? 'Auto-detect from student question' : subject;
    const effectiveLevel = (!level || level === 'General') ? 'Auto-detect from student question' : level;

    const previousMessages = (Array.isArray(history) ? history : [])
      .slice(-10)
      .filter(item => item && typeof item.content === 'string')
      .map(item => `${item.role === 'assistant' || item.role === 'model' ? 'Assistant' : 'Student'}: ${item.content.slice(0, 4000)}`)
      .join('\n\n');

    const attachmentNotes = (Array.isArray(attachments) ? attachments : [])
      .slice(0, 5)
      .filter(file => typeof file?.text === 'string' && file.text.trim())
      .map(file => `File ${file.name || ''}:\n${file.text.slice(0, 8000)}`)
      .join('\n\n');

    const prompt = [
      `System: You are Levarona, an expert educational AI tutor for ${effectiveSubject} at ${effectiveLevel} level. Mode: ${mode}. Provide direct, step-by-step answers without filler.`,
      previousMessages ? `Conversation History:\n${previousMessages}` : '',
      attachmentNotes ? `Attachments:\n${attachmentNotes}` : '',
      `Student's question:\n${String(message).slice(0, 15000)}`
    ].filter(Boolean).join('\n\n');

    const data = await callGemini(prompt);
    const reply = extractText(data);

    if (!reply) {
      throw new Error('Gemini returned an empty response.');
    }

    res.json({ reply });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: error.message || 'Chat request failed.' });
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
