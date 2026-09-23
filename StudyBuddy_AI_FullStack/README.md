# StudyBuddy AI — Full Stack + Gemini

This version uses **Google Gemini API** for the AI Quiz Generator.

## Features

- Login / Signup
- Student profile
- Study Planner
- Topics progress
- AI Quiz Generator
- Easy / Medium / Hard
- 5 / 10 / 15 questions
- 4 options per question
- Correct answer + explanation
- Quiz score + history
- Dark mode
- Gemini API key stays on the backend

## 1. Install Node.js

Use Node.js 18 or newer.

Check:

```bash
node -v
```

## 2. Create your Gemini API key

Create a Gemini API key in Google AI Studio.

Then create a file named `.env` in this folder by copying `.env.example`.

Put your key here:

```env
GEMINI_API_KEY=your_real_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

**Do not share `.env` or your API key.**

## 3. Start StudyBuddy

Open the project folder in VS Code.

In the terminal:

```bash
npm start
```

You should see:

```text
StudyBuddy running at http://localhost:3000
Gemini AI: configured
```

Then open:

```text
http://localhost:3000
```

**Do not double-click `index.html`.** Open the app through the Node.js server so `/api/generate-quiz` can reach Gemini.

## 4. Test the backend

Open:

```text
http://localhost:3000/api/health
```

You should get JSON similar to:

```json
{
  "ok": true,
  "aiConfigured": true,
  "provider": "Google Gemini",
  "model": "gemini-2.5-flash"
}
```

## 5. Generate a real AI quiz

Login → **AI Quiz** → enter a topic → choose difficulty/questions → **Generate Quiz**.

The browser sends the request to:

```text
POST /api/generate-quiz
```

The backend sends it to Gemini and returns structured quiz JSON to the frontend.

## Security note

The API key is read from the backend `.env` file. It is not included in `app.js` or `index.html`.

The current login/profile system is still a browser-local prototype using `localStorage`. For a public production application, use a real database, secure password hashing, sessions/JWT, HTTPS, rate limiting, and secure cookies.

## If Gemini fails

The app will show an error instead of silently pretending that Gemini generated the quiz. Check:

1. `.env` exists beside `server.js`
2. `GEMINI_API_KEY` is correct
3. The server was restarted after changing `.env`
4. `http://localhost:3000/api/health` says `aiConfigured: true`
5. The terminal for `npm start` shows any Gemini API error
