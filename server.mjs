we import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const CHAT_MODEL =

const express = require('express');
const app = express();

// Middleware to parse JSON and serve your static frontend files (index.html, etc.)
app.use(express.json());
app.use(express.static('.'));

// Handle the /api/word route called by your frontend
app.post('/api/word', async (req, res) => {
    try {
        const { subject, level, prompt } = req.body;
        const apiKey = process.env.GEMINI_API_KEY; // Reads the secret key safely from Bento

        if (!apiKey) {
            return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
        }

        // Build the prompt for Gemini based on user input
        const userPrompt = prompt || `Create a study guide for ${subject} at level ${level}`;

        // Call Google Gemini API securely from the backend
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }]
            })
        });

        const data = await response.json();

        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            const aiReply = data.candidates[0].content.parts[0].text;
            // Send the AI response back to your web app frontend
            res.json({ success: true, text: aiReply });
        } else {
            res.status(500).json({ error: "Failed to get a response from Gemini." });
        }
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Internal server error." });
    }
});

// Start the server on Bento's designated port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Levarona AI server running on port ${PORT}`));
 process.env.GEMINI_CHAT_MODEL || 'gemini-3.8-flash';
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

async function callGemini(input) {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY is missing from hosting settings.');
  }

  // 25-second timeout safeguard to prevent infinite hanging on hard equations
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
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
            'You are Levarona, an expert educational AI tutor. Automatically detect the subject and difficulty level from the student query. Never ask the student to specify a subject or lesson name. Provide direct, precise, step-by-step answers immediately. Do not include conversational filler, greetings, or polite chat padding. Go straight to the answer and explanation in the language used by the student.',
          generation_config: {
            temperature: 0.3,
            max_output_tokens: 2048
          },
          store: false
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini API error (Status ${response.status})`);
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('The request took too long and timed out. Please try a simpler question or break it into smaller steps.');
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
      .map(item => 
        `${item.role === 'assistant' || item.role === 'model' ? 'Assistant' : 'Student'}: ${item.content.slice(0, 4000)}`
      )
      .join('\n\n');

    const attachmentNotes = (Array.isArray(attachments) ? attachments : [])
      .slice(0, 5)
      .filter(file => typeof file?.text === 'string' && file.text.trim())
      .map(file => `File ${file.name || ''}:\n${file.text.slice(0, 8000)}`)
      .join('\n\n');

    const prompt = [
      `Context -> Subject: ${effectiveSubject} | Level: ${effectiveLevel} | Mode: ${mode}`,
      previousMessages ? `Conversation History:\n${previousMessages}` : '',
      attachmentNotes ? `Attachments:\n${attachmentNotes}` : '',
      `Student's question:\n${String(message).slice(0, 15000)}`
    ].filter(Boolean).join('\n\n');

    const data = await callGemini(prompt);
    const reply = extractText(data);

    if (!reply) {
      throw new Error('Gemini returned an empty response. Please try rephrasing your question.');
    }

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

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
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

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
