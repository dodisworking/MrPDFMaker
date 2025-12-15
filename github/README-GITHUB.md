# What to Upload to GitHub

## 📁 Upload Everything in This `github` Folder

This folder contains **ONLY** the essential files needed for GitHub.

## 📋 Files Included:

### Frontend (public folder)
- `index.html` - Main HTML file
- `script.js` - JavaScript with API configuration
- `style.css` - Styling
- `MrPDF.gif` - Main GIF
- `h.gif` - Success GIF
- `background.png` - Background image
- `cloud 1.png`, `cloud 2.png`, `sun.png` - Decorative images

### Backend (for reference)
- `server.js` - Node.js server (won't run on GitHub Pages, but good to have)
- `package.json` - Dependencies list

### Configuration
- `.gitignore` - Tells Git what to ignore
- `.env.example` - Environment variables template
- `README.md` - Project documentation
- `DEPLOYMENT.md` - How to deploy the backend

## 🚀 Steps to Upload:

1. **Go to your GitHub repository**: https://github.com/dodisworking/MrPDFMaker

2. **Upload all files from this `github` folder**:
   - You can drag and drop the entire `github` folder contents
   - Or use GitHub's upload feature

3. **Important**: After uploading, update `public/index.html` line 11:
   ```javascript
   window.API_BASE_URL = 'https://your-backend-url.com';
   ```
   (Change this to your actual backend URL once you deploy it)

## ⚠️ Important Notes:

- **GitHub Pages can only serve static files** (HTML, CSS, JS, images)
- **The backend (`server.js`) must be deployed separately** to Railway, Render, Heroku, or Cloud Run
- See `DEPLOYMENT.md` for backend deployment instructions

## 📦 What's NOT Included (and shouldn't be):

- `node_modules/` - Dependencies (too large, install with `npm install`)
- `uploads/` - User uploads (temporary files)
- `outputs/` - Generated PDFs (temporary files)
- `.env` - Secrets (use `.env.example` as template)
- `server-cloudrun.js` - Cloud Run specific (optional)

## ✅ After Uploading:

1. Enable GitHub Pages in repository settings
2. Deploy backend to a hosting service (see DEPLOYMENT.md)
3. Update `API_BASE_URL` in `index.html` with your backend URL
4. Test the site!

