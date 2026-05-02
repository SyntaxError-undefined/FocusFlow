# FocusFlow Smart Timer

AI-powered Pomodoro planner that turns today's objective into:

- a practical task list
- pomodoro estimates for each task
- AI-selected complexity levels
- a recommended working order with reasons
- Firebase-authenticated user accounts
- Firestore-backed analytics and session history

## Tech stack

- Frontend: HTML, CSS, JavaScript
- Auth: Firebase Authentication
- Database: Cloud Firestore
- AI planning: Gemini API
- Deployment: Render Web Service

## Environment setup

1. Copy `.env.example` to `.env`
2. Add your real `GEMINI_API_KEY`
3. Open `firebase-config.js`
4. Paste your Firebase web SDK config values into that file
5. In Firebase Authentication, add your domains to Authorized domains
6. Run `npm start` for local development

## Deploy on Render

1. Create a new Render `Web Service`
2. Connect your GitHub repository
3. Use:
   - Build command: `npm install`
   - Start command: `npm start`
4. Add environment variables:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL=gemini-2.5-flash`
5. After Render gives you a URL, add that domain in Firebase Authentication Authorized domains

## Public repo safety

- Keep `.env` out of Git
- Keep the real Gemini key only in local `.env` and Render environment variables
- `.env.example` should contain placeholders only
- Firebase web config in `firebase-config.js` is expected for client-side Firebase apps, but it is not your Gemini secret
- If a Gemini key was ever leaked before, revoke it and create a fresh one before deployment

## Notes

- The API key stays on the server, not in browser code.
- The default model is `gemini-2.5-flash`, and you can override it in `.env`.
- For Render, deploy this as a Web Service, not a Static Site, because the AI request runs on the server.
- The app now uses Firebase Authentication plus Firestore to store user profiles, saved AI plans, and completed Pomodoro sessions.
