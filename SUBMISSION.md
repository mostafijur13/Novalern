# Novalern – Devpost submission

## Project name

Novalern

## Short project description

Novalern turns your class notes, textbook pages and homework problems into short narrated video lessons, then quizzes you every day and gives you a weekly recap so what you learned actually sticks.

## Detailed description

### The problem I'm solving

Most students don't struggle because they're lazy. They struggle because the material comes at them in one format: a teacher talking, then a wall of text to revise from. If you missed something in class, or the textbook explanation didn't click, you're on your own. Chat-based AI tools help a bit, but they answer with another wall of text, and reading a long answer on a phone at 11pm is not how anyone learns.

The second problem is forgetting. You understand something on Monday and by Friday it's gone, because nothing made you pull it back out of your head.

### Why it matters

Explanations that are spoken, shown and broken into small steps are easier to follow than paragraphs, especially for younger students, students learning in a second language, and anyone who finds reading hard. And the research on retrieval practice is clear: being tested on something, even informally, is one of the most reliable ways to remember it. Very few study tools do both of these things, and almost none do them from the student's own material.

### How Novalern works

1. **Bring your lesson.** Type a question, tap the mic and say it, or upload a photo or PDF of your notes or a problem you're stuck on.
2. **Watch it as a video.** Novalern doesn't reply with a chat message. It writes a scene-by-scene lesson and plays it like a short video: a headline and a few key points per scene, a real picture or diagram that matches what's being explained, a fun sticker for personality, and a natural voice reading the explanation. Scenes animate in and move on automatically. You can pause, skip, replay, or read the transcript. Every lesson ends with a quick recap and a self-check question.
3. **Build a history.** Each session is saved as a lesson with its own title, topic and summary, so you can come back to it any time.
4. **Daily exam.** Pick the lessons you studied and take a short test in whatever way suits you: multiple choice, written answers, or voice, where the question is read out and you answer by speaking. Multiple choice is marked instantly; written and spoken answers are graded by AI with a line of feedback on each one, and a model answer to compare against.
5. **Weekly recap.** Everything you studied in the last seven days is grouped by topic. Pick a topic and get a recap exam built from those lessons.
6. **See your progress.** Scores for every exam, average and best score, number of lessons learned.

Under the hood: the AI returns the lesson as structured data (scenes with narration, caption, bullet points, an image search query and a sticker idea) rather than free text, which is what makes it possible to render it as a video. Pictures come from Wikimedia Commons and Wikipedia, with Google Images as an option. Stickers come from Giphy. Narration uses Groq's text-to-speech model and falls back to the browser's own voice if it's unavailable. Each user's lessons and exams live in their own private Firestore space, and the AI calls go through a small server function so API keys never reach the browser.

## Demo video script (about 2 minutes 30 seconds)

**0:00 – 0:15, hook (face to camera or voice over the landing page)**
"This is Novalern. You give it your lesson, in any form, and it teaches it back to you as a short video, then makes sure you remember it. Let me show you."

**0:15 – 0:30, sign in and home**
Sign in with Google. Point at the home page: the Learn with AI button, History, Daily exam and Weekly recap in the sidebar.
"Everything starts from here. Lessons you've done show up in History, and the exams are built from them."

**0:30 – 1:15, Learn with AI**
Click Learn with AI. Upload a photo of a textbook page (or a PDF), then tap the mic and say "explain this so I can understand it for my test." Send.
While it loads: "I can type, speak, or upload a photo or PDF. It takes a few seconds."
Let the video lesson autoplay for two or three scenes. Point out the headline, the bullet points, the diagram, the sticker, and the voice.
"Instead of a long text answer, I get this. Each scene is read out loud, shows the key points, and pulls in a real diagram of what it's talking about. I can pause, skip, or read the transcript."
Skip to the last scene: "Every lesson ends with a recap and a quick question to check I actually got it."

**1:15 – 1:35, follow-up and history**
Type a follow-up question, for example "give me an example problem." Show the short follow-up clip start.
Go back to Home and show the lesson in History with its auto-generated title and topic.
"Follow-ups become short clips too. And everything is saved with a title and topic."

**1:35 – 2:10, Daily exam**
Open Daily exam. Select the lesson, choose Voice, five questions, Start.
Click Hear question, then Answer by voice and speak an answer. Answer one or two more by typing. Submit.
"The daily exam is built from what I just learned. I can do multiple choice, type, or just talk. Written and spoken answers are graded by AI and I get feedback on each one."
Show the score and the per-question feedback.

**2:10 – 2:25, Weekly recap and profile**
Open Weekly recap: show topics from the week and start a recap exam, then open Profile with the stats.
"At the end of the week, Novalern groups what I studied by topic and gives me a recap exam. My scores and progress are all here."

**2:25 – 2:35, close**
"Novalern: learn it as a video today, prove you still know it tomorrow. Thanks for watching."

Tips: record in Chrome with the sound on, keep the browser at full screen, and prepare a textbook photo in advance so the upload is quick.

## Technologies used

- Frontend: React 19, Vite, React Router
- Backend and data: Firebase Authentication (email/password and Google), Cloud Firestore with per-user security rules, Vercel serverless functions as the API proxy
- AI: Groq API with openai/gpt-oss-120b for lessons, exam generation and grading (JSON-schema structured output), qwen/qwen3.8-27b for reading photos and scanned pages, canopylabs/orpheus-v1-english for text-to-speech
- Visuals: Giphy Stickers API, Wikimedia Commons and Wikipedia image APIs, Google Custom Search (optional)
- Voice input and fallback narration: Web Speech API
- PDF reading in the browser: pdf.js
- Hosting: Vercel

## Screenshots

1. Home page with the Learn with AI card, stats and History
2. A video lesson playing: headline, bullets, diagram, sticker, progress bar
3. Daily exam setup: choose lessons, mode (multiple choice / written / voice) and length
4. Exam results with per-question feedback
5. Weekly recap with topics of the week

## Project links

- GitHub: https://github.com/mostafijur13/Novalern
- Live app: <your Vercel URL>

---

# Project story (Devpost "About the project")

## Inspiration

We kept watching the same thing happen to friends and younger students: they'd sit with a textbook open, read the same paragraph three times, and still not get it. Then they'd try an AI chatbot and get back an even longer paragraph. The explanation was technically there, but nobody was going to absorb it at 11pm on a phone.

What actually works for most people is being shown and told, in small steps, by someone who sounds like they want you to get it. A good teacher at a whiteboard. A YouTube explainer. That's where Novalern came from: what if the AI's answer was a short video instead of a wall of text? And what if it followed up the next day to check you still remembered it, the way a good tutor would?

## What it does

You bring your lesson in whatever form you have it: type a question, say it into the mic, or upload a photo or PDF of your notes or a problem you're stuck on. Novalern turns it into a short narrated video. Each scene has a headline, a few key points, a real picture or diagram of the thing being explained, a sticker for a bit of personality, and a voice reading it out. Scenes animate in, the colours shift, and it moves on by itself. You can pause, skip, replay, or read the transcript. Every lesson ends with a recap and a self-check question.

Every session is saved as a lesson with its own title and topic. From those lessons, Novalern builds a daily exam. You pick how to answer: multiple choice, typing, or just talking, where the question is read to you and you speak your answer. Multiple choice is marked instantly. Written and spoken answers are graded by AI, with a line of feedback and a model answer for each one. At the end of the week, everything you studied is grouped by topic and you get a recap exam on whichever topic you choose. Your scores and progress build up on your profile.

## How we built it

The frontend is React with Vite. Sign-in and storage are Firebase: Authentication for email and Google login, and Firestore for lessons and exams, with security rules so each user can only ever read their own data.

The trick that makes the video possible is not asking the model for text. We ask it for structured data: a title and a list of scenes, each with narration, a caption, bullet points, an image search query, a sticker keyword and an animation style. The model runs on Groq (gpt-oss-120b for lessons, exams and grading, and a Qwen vision model when there's a photo or a scanned page), with JSON-schema structured output so the shape is guaranteed. The player then renders those scenes as a video.

Pictures come from Wikimedia Commons and Wikipedia, with Google Images as an option, because the search query the model writes is specific enough ("xylem water transport diagram") to find real diagrams. Stickers come from the Giphy Stickers API. Narration uses Groq's Orpheus text-to-speech model, with the browser's own speech synthesis as a fallback, and voice input uses the Web Speech API. PDFs are read in the browser with pdf.js; scanned PDFs are rendered to images and sent to the vision model. Sound effects are synthesized with the Web Audio API, with Freesound as an optional source. The app is hosted on Vercel, and the AI calls go through small serverless functions there so no API key is ever in the browser.

## Challenges we ran into

**The first version was boring.** A chat bubble with a long markdown answer. It worked, but it wasn't something anyone would learn from. Restructuring the whole AI layer around scenes instead of text, and then building a player that felt like a video rather than a slideshow, took most of the project.

**Choosing a model API, three times.** We started with one provider, switched to Meta's Model API, hit a billing wall, and finally landed on Groq, which was fast and had vision, structured output and text-to-speech under one key. Each switch meant rewriting the request shapes and re-testing images and PDFs.

**Text-to-speech limits.** The TTS model takes at most 200 characters per request and has a low rate limit. We had to make the model keep every scene's narration short, chunk anything longer, request audio one scene at a time while the previous one plays, cache everything, and fall back to the browser voice without breaking the flow.

**Pictures that are actually relevant.** A generic word like "leaf" gives you a random leaf. Getting the model to write precise image queries, and discovering that Commons file search beats Wikipedia's lead image for diagrams, made a big difference.

**Deploying.** Environment variables that worked locally weren't on Vercel, the Firebase function we'd planned on wasn't available on the free plan, and the live app just said "internal [0]". Moving the key-holding code into Vercel serverless functions fixed it properly.

## Accomplishments that we're proud of

- Lessons that genuinely play like short videos, from a photo of a page, with a voice, pictures and motion, in a few seconds.
- Three ways to take an exam, including answering by speaking, with AI grading that gives real feedback instead of just a score.
- The whole learn-then-test loop working end to end: lesson today, daily exam, weekly recap, progress on the profile.
- Shipping it with keys kept on the server, per-user data rules, and graceful fallbacks so nothing hard-fails when a sticker, picture or voice isn't available.

## What we learned

Asking a model for structured data instead of prose changes what you can build with it. Once the lesson was a list of scenes, everything else, the player, the narration, the pictures, the exams, became ordinary frontend work.

We also learned a lot about the gap between "works in the demo" and "works for a real student": rate limits, browser autoplay rules, speech APIs that only exist in some browsers, hotlink-protected images, and environment variables that silently don't exist in production. Most of the project's robustness came from assuming every external service might say no.

## What's next for novalern

- Spaced repetition: schedule exam questions based on what you got wrong, not just what you studied recently.
- Share a lesson: send a generated video lesson to a classmate or a study group.
- Teacher mode: a teacher uploads the week's material once, and every student gets their own lessons and exams from it.
- More languages for narration, and offline playback of saved lessons.
- A proper mobile app, since most students will use this on a phone.
