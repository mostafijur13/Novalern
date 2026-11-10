# Novalern

AI study companion: learn from your notes, then get daily exams and weekly recaps.

- **Learn with AI** – ask by text, voice (mic) or by uploading PNG/JPG/PDF files. The answer comes back as a short **narrated video lesson**: scene-by-scene headlines, bullet points and stickers, read aloud and auto-advancing like a video, with play/pause, scene skipping and a transcript.
- **History** – every session is saved as a lesson with an auto-generated title, topic and summary.
- **Daily exam** – pick recent lessons and take a multiple-choice, written or voice exam. Graded instantly (MCQ) or by AI (written/voice) with per-question feedback.
- **Weekly recap** – lessons from the last 7 days grouped by topic; pick a topic and take a recap exam.

Stack: React 19 + Vite, React Router, Firebase Auth (email/password + Google), Firestore, Firebase Cloud Functions, **Groq** (`openai/gpt-oss-120b` for text, `qwen/qwen3.8-27b` for images, via `groq-sdk`), pdf.js for PDF reading, Web Speech API for voice.

## 1. Firebase setup

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method**: enable *Email/Password* and *Google*.
3. **Firestore Database**: create a database (production mode is fine; rules are in `firestore.rules`).
4. **Project settings → Your apps → Web app**: register an app and copy the config.
5. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values.
6. Deploy the security rules:

   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use <your-project-id>
   firebase deploy --only firestore:rules
   ```

## 2. Groq API key

1. Create a key at <https://console.groq.com/keys> (free tier available).
2. Accept the terms for the voice model once at <https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english> (otherwise lessons use the browser voice).
3. Choose how the app will use the key:

**A. Vercel (recommended for hosting)** – the `api/` folder contains serverless functions that hold the key. In the Vercel project set `GROQ_API_KEY` (no `VITE_` prefix) plus all the `VITE_FIREBASE_*` and `VITE_GIPHY_API_KEY` variables, and leave `VITE_GROQ_API_KEY` unset. Redeploy after changing variables. Also add your Vercel domain under Firebase Authentication → Settings → Authorized domains.

**B. Firebase Cloud Function** – requires the Blaze plan. Set `VITE_AI_BACKEND=firebase` at build time and deploy:

```bash
cd functions && npm install && cd ..
firebase functions:secrets:set GROQ_API_KEY
firebase deploy --only functions
```

**C. Direct from the browser (local development only)** – set `VITE_GROQ_API_KEY=gsk_...` in `.env`. The key is bundled into the page, so never deploy a build made this way.

## 3. Run

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

## 4. Deploy

**Vercel:** push the repo and import it on vercel.com (framework: Vite). `vercel.json` rewrites routes to the app and gives the API functions a 60 s limit. Set the environment variables listed in 2A.

**Firebase Hosting:**

```bash
npm run build
firebase deploy --only hosting
```

## Data model (Firestore)

```
users/{uid}                         displayName, email, photoURL
users/{uid}/lessons/{lessonId}      title, topic, summary, messages[{role,text,attachments[]}], createdAt, updatedAt
users/{uid}/exams/{examId}          kind (daily|weekly), mode (mcq|written|voice), title, lessonIds[], questions[],
                                    answers{}, results[], score, total, status, overallFeedback, createdAt
```

## Notes

- AI calls live in `src/lib/ai.js`. To change models, edit `TEXT_MODEL` / `VISION_MODEL` there and `ALLOWED_MODELS` in `functions/index.js`.
- Narration: `src/lib/tts.js` uses Groq text-to-speech (`canopylabs/orpheus-v1-english`, 200 characters per request, one request at a time) and caches the audio per scene. The first use needs a one-time terms acceptance at <https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english>. If TTS is unavailable or rate limited, the player falls back to the browser voice automatically. Voice and on/off are on the Profile page.
- Video lessons: the model returns a JSON script (`title` + `scenes[{narration, caption, bullets, imageQuery, sticker, effect}]`). `src/components/LessonPlayer.jsx` plays it: a real picture or diagram for the scene (slow zoom), a Giphy sticker badge for fun, animated captions (fade / slide / zoom / bounce chosen per scene), narration and auto-advance.
- Pictures: `src/lib/images.js` searches Google Images when `VITE_GOOGLE_CSE_KEY` + `VITE_GOOGLE_CSE_CX` are set (see `.env.example`), otherwise Wikipedia page images and Wikimedia Commons, which need no key. Stickers come from `src/lib/stickers.js` (`VITE_GIPHY_API_KEY`). The lesson still plays if either is missing.
- Text questions go to `openai/gpt-oss-120b`. When a message has images (photos, or scanned PDF pages), it goes to the vision model `qwen/qwen3.8-27b`, which accepts up to 3 images per request.
- PDFs with selectable text are read in the browser with pdf.js and sent as text. Scanned PDFs have their first 3 pages rendered to images.
- Exams and lesson labels use JSON-schema structured output (`response_format: json_schema`, strict), so the questions always come back in a fixed shape.
- Voice input/output uses the browser's Web Speech API (Chrome and Edge). Other browsers can still use text and file upload.
- Uploaded files are sent to the AI for that message only; they are not stored. The lesson keeps the file names and the conversation text.
- File limit is 6 MB; large photos are downscaled to 1600 px so requests stay small.
