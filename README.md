Multi-View Video Sync (2×2)

FastAPI backend with yt-dlp extraction and a plain JS frontend that loads four synchronized video panes (2×2). Master controls play/pause/seek/rate/volume/mute across all panes with periodic drift correction.

Stack
- Backend: FastAPI, uvicorn, yt-dlp, slowapi (rate limiting)
- Frontend: Plain HTML/CSS/JS, hls.js, YouTube IFrame API

Setup (Windows/PowerShell)
```powershell
cd C:\Users\<you>\OneDrive\Desktop\cursor
py -3 -m venv backend\venv
backend\venv\Scripts\python.exe -m pip install --upgrade pip
backend\venv\Scripts\python.exe -m pip install fastapi "uvicorn[standard]" yt-dlp slowapi
```

Run the server:
```powershell
backend\venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

Open the app:
- Navigate to `http://localhost:8000/`

API
POST `/api/fetch`
Request body:
```json
{ "url": "https://www.youtube.com/watch?v=ABCDEFG" }
```
Success response example:
```json
{
  "status": "ok",
  "provider": "youtube",
  "title": "Example Video Title",
  "duration": 124.5,
  "sources": [
    {"type": "hls", "url": "https://.../playlist.m3u8"},
    {"type": "mp4", "url": "https://.../video_720.mp4"}
  ],
  "ttl_seconds": 3600
}
```
Error example:
```json
{ "status": "error", "message": "Geo-blocked or unsupported provider" }
```

cURL example:
```bash
curl -X POST http://localhost:8000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

Notes
- Only YouTube/Vimeo are allowed (safelist). Others return an error.
- Many URLs expire; the app shows a TTL hint and you can reload URLs if needed.
- Autoplay may be blocked by browsers; press Play to start all.
- YouTube may fall back to iframe control if direct streams are not accessible.
- Drift correction runs every ~1s; if drift > 300ms, a soft seek realigns.

Security & Legality
- Respects provider ToS; no paywalled/login-protected streams.
- Includes simple rate-limiting via slowapi.


