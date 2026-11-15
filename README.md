# AstroLens X

A responsive dark-themed astronomy dashboard built with React, Vite, and Tailwind CSS. It searches a small local catalog of published coordinates and queries NASA/IPAC IRSA for SPHEREx spectral images at the selected position.

Observation rows come from IRSA's live Simple Image Access service. The panel shows archive dates, instrument and bandpass fields, and links to the FITS products. IRSA does not publish a preview image for these files, so the panel does not display one. Details, test counts, and blockers are in `docs/spherex-archive.md`.

## What you can do

- Search preset objects by common name, designation, or alias.
- Select an object and read its stored right ascension and declination.
- Query IRSA for SPHEREx spectral images at that position and read the returned metadata.

Coordinates come from SIMBAD catalog entries stored in `src/data/catalog.js`. They are reference positions, not observations collected by this app. A name that is not in the catalog stays unresolved.

## Requirements

- Node.js 20 or newer
- npm
- Python 3.11 or newer

## Setup

```bash
npm install
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
```

Start the archive API and the Vite app in two terminals:

```bash
backend/.venv/Scripts/uvicorn app.main:app --app-dir backend --port 8000
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`. Vite proxies `/api` to the API on port 8000. On macOS or Linux, use `backend/.venv/bin/python` and `backend/.venv/bin/uvicorn` instead of the `Scripts` paths.

## Deploy the frontend and API

The frontend can be deployed to Vercel and the FastAPI backend to Render. `vercel.json` rewrites `/api/...` requests to the Render API at `https://backend-astrolen.onrender.com`, so no Vercel environment variable is needed. The backend also allows the production Vercel domain in its CORS configuration. For local direct API requests, copy `.env.example` to `.env`; do not put backend API keys in a `VITE_` variable because Vite exposes those values to browsers.

The backend must be running before the frontend can use it. The Render build command installs the repository-root `requirements.txt`; include `astropy` there (the FITS and comparison services import it) and verify that `https://backend-astrolen.onrender.com/api/health` returns `{"status":"ok","archive":"IRSA SPHEREx"}` after deployment.

## Other scripts

```bash
npm run build
npm run preview
npm run lint
```

## Project layout

```text
src/
  App.jsx                         screen state: query and selection
  components/AppHeader.jsx        title and connection status
  components/SearchBar.jsx        name search
  components/PresetList.jsx       preset astronomical objects
  components/CoordinatePanel.jsx  RA and Dec readout
  components/NasaResults.jsx      IRSA SPHEREx results, including loading and errors
  data/catalog.js                 static SIMBAD positions
  lib/coordinates.js              sexagesimal catalog positions as degrees
  lib/searchCatalog.js            catalog text match
  lib/spherexApi.js               browser client for the local API
backend/app/main.py               FastAPI proxy
backend/app/spherex.py            IRSA SIA query
docs/spherex-archive.md           endpoints, live test notes, and blockers
```
