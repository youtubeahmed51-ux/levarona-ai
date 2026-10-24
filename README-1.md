# Levarona — Gemini AI Tutor

## Deploy on Render
1. Upload all files in this folder to the root of your GitHub repository. Do not upload the ZIP itself.
2. In Render, create a **Web Service** connected to the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. In Render → Environment, add `GEMINI_API_KEY` with your Gemini API key. Never put a real key in GitHub or in `index.html`.
6. Deploy. The app uses `GEMINI_MODEL` (default `gemini-2.5-flash`) for chat and `GEMINI_IMAGE_MODEL` (default `gemini-2.5-flash-image`) for image generation.

`index.html` is the browser interface; `server.mjs` is the server. Both are required. `package.json` lists the server dependencies. `Levarona_Suggested_Expanded_Lessons.docx` is supporting lesson material.

## Notes
- This is source code, not a live deployed site.
- The server keeps the API key private in an environment variable.
- Image/file attachment handling depends on the data the browser interface sends; large or unsupported files may need text extraction or a compatible model.
