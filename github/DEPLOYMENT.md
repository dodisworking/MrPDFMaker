# Deployment Guide - MrPDF

## The Problem

**GitHub Pages only serves static files** - it cannot run Node.js servers. Your `server.js` needs to run on a separate server.

## Solution Options

### Option 1: Deploy Backend Separately (Recommended)

Deploy the backend to a hosting service, then point your frontend to it.

#### Quick Deploy Options:

**A. Railway.app (Easiest)**
1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select your repository
4. Railway auto-detects Node.js and runs `npm start`
5. Copy the deployment URL (e.g., `https://mrpdf-backend.railway.app`)
6. Update frontend to use this URL (see below)

**B. Render.com**
1. Go to [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub repo
4. Build: `npm install`
5. Start: `node server.js`
6. Copy the URL

**C. Heroku**
```bash
heroku create mrpdf-backend
git push heroku main
heroku open
```

### Option 2: Use Google Cloud Run (Already Set Up!)

You already have `server-cloudrun.js` ready! See `README-CLOUDRUN.md` for deployment.

### Option 3: Update Frontend to Point to Backend

Once your backend is deployed, update the frontend:

**Method 1: Set in HTML (before script.js loads)**
```html
<script>
  // Set your backend URL here
  window.API_BASE_URL = 'https://your-backend.railway.app';
</script>
<script src="script.js"></script>
```

**Method 2: Update index.html**
Add this in the `<head>` section:
```html
<script>
  // Change this to your deployed backend URL
  window.API_BASE_URL = 'https://your-backend-url.com';
</script>
```

## Current Setup

- **Frontend**: Can be on GitHub Pages (static files)
- **Backend**: Must be on a Node.js hosting service
- **Connection**: Frontend calls backend via `API_BASE_URL`

## Testing Locally

1. Start backend: `node server.js` (runs on http://localhost:3000)
2. Open frontend: Open `public/index.html` in browser
3. Since `API_BASE_URL` is empty, it uses relative URLs (works with localhost)

## Production Setup

1. Deploy backend to Railway/Render/Heroku/Cloud Run
2. Get backend URL (e.g., `https://mrpdf-backend.railway.app`)
3. Update `public/index.html` to set `window.API_BASE_URL`
4. Deploy frontend to GitHub Pages
5. Test: Frontend on GitHub Pages → Backend on hosting service ✅

## Environment Variables

Your backend needs these in `.env`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_ID=price_...
SESSION_SECRET=your-secret-here
```

Set these in your hosting service's environment variables section.

