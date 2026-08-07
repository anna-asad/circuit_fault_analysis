# Deployment Guide

This guide covers deploying the Circuit Lab Simulator application.

## Prerequisites

### System Requirements

1. **Python 3.9+**
2. **Node.js 18+** (for frontend)
3. **ngspice** (circuit simulator - CRITICAL)
   - Windows: Download from http://ngspice.sourceforge.net/download.html
   - macOS: `brew install ngspice`
   - Linux: `sudo apt-get install ngspice` (Ubuntu/Debian) or `sudo yum install ngspice` (RHEL/CentOS)

### Verify ngspice Installation

```bash
# Should return version info
ngspice --version
# or on Windows:
ngspice_con --version
```

## Backend Setup

### 1. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
# Edit .env with your actual API keys (optional for RAG features)
```

Required for AI explanations (optional):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase service role key
- `GEMINI_API_KEY` - Your Google Gemini API key

### 3. Verify Models

Ensure these files exist in the `models/` directory:
- `fault_classifier.joblib`
- `feature_columns.joblib`
- `label_columns.joblib`
- `nominal_lookup.joblib`

If missing, run:
```bash
cd ..
python src/dataset_generator.py
python src/train.py
```

### 4. Start Backend Server

```bash
cd backend
python main.py
# Backend will run on http://localhost:8000
```

Or for production:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Frontend Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure API Endpoint (if needed)

If deploying backend to a different host, update the API URL in:
- `frontend/src/components/CircuitCanvas.jsx`
- `frontend/src/components/SimulateButton.jsx`
- `frontend/src/components/PredictPanel.jsx`
- `frontend/src/components/DiagnoseChallenge.jsx`

Look for `http://localhost:8000` and replace with your backend URL.

### 3. Build for Production

```bash
npm run build
# Outputs to frontend/dist/
```

### 4. Preview Production Build

```bash
npm run preview
```

### 5. Serve with Static Server

```bash
npm install -g serve
serve -s dist -l 3000
```

Or deploy the `dist/` folder to any static hosting service:
- Netlify
- Vercel
- GitHub Pages
- AWS S3 + CloudFront
- Firebase Hosting

## Production Deployment

### Backend Options

1. **Docker** (recommended)
   ```dockerfile
   FROM python:3.9
   RUN apt-get update && apt-get install -y ngspice
   WORKDIR /app
   COPY backend/requirements.txt .
   RUN pip install -r requirements.txt
   COPY backend/ .
   COPY models/ ../models/
   CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
   ```

2. **Cloud Platforms**
   - AWS EC2 (install ngspice manually)
   - Google Cloud Run (custom container with ngspice)
   - Heroku (use buildpack for ngspice)
   - DigitalOcean App Platform
   - Railway

3. **VPS Deployment**
   ```bash
   # Install system dependencies
   sudo apt-get update
   sudo apt-get install -y python3 python3-pip ngspice
   
   # Clone repo and setup
   git clone <your-repo>
   cd <repo>/backend
   pip install -r requirements.txt
   
   # Run with systemd or supervisor
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

### Frontend Options

1. **Static Hosting** (easiest)
   - Netlify: Drag & drop `dist/` folder
   - Vercel: Connect Git repo, auto-deploy
   - Cloudflare Pages: Connect Git repo
   - GitHub Pages: Push `dist/` to gh-pages branch

2. **CDN Deployment**
   - AWS S3 + CloudFront
   - Google Cloud Storage + Cloud CDN
   - Azure Blob Storage + CDN

### Environment-Specific Configuration

For production, update:

1. **Backend CORS settings** in `backend/main.py`:
   ```python
   origins = [
       "https://your-production-domain.com",
   ]
   ```

2. **Frontend API URL**: Replace all `http://localhost:8000` with your production backend URL

## Health Checks

### Backend Health Check

```bash
curl http://localhost:8000/health
# Should return: {"status": "ok", "ngspice": "installed", ...}
```

### Test Simulation

```bash
curl -X POST http://localhost:8000/simulate \
  -H "Content-Type: application/json" \
  -d '{"nodes":[...],"edges":[...]}'
```

## Troubleshooting

### ngspice not found
- Verify installation: `ngspice --version`
- Check PATH environment variable
- On Windows, use `ngspice_con` instead of `ngspice`

### Model files missing
- Run dataset generation and training scripts
- Check `models/` directory has all 4 `.joblib` files

### CORS errors
- Update `origins` list in `backend/main.py`
- Ensure frontend URL is whitelisted

### RAG features not working
- Verify `.env` file has correct API keys
- Check Supabase connection
- Verify Gemini API key is valid

## Security Notes

1. **Never commit `.env` file** - Use `.env.example` as template
2. **Use environment variables** for all secrets
3. **Enable HTTPS** in production
4. **Rate limit API endpoints** in production
5. **Validate all user inputs** (already implemented)

## Monitoring

Consider adding:
- **Logging**: Configure uvicorn logging level
- **Error tracking**: Sentry, Rollbar, etc.
- **Performance monitoring**: New Relic, DataDog
- **Uptime monitoring**: UptimeRobot, Pingdom

## Backup

Ensure regular backups of:
- Model files (`models/`)
- Environment configuration (`.env`)
- Training dataset (`dataset/dataset.csv`)
