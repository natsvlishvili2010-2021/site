# Multi-View Video Sync Application

## Overview
This is a full-stack web application that allows users to load and synchronize up to 4 videos simultaneously in a 2x2 grid layout. It supports YouTube and Vimeo videos with master controls for play/pause/seek/volume across all panes, including automatic drift correction.

## Current State
✅ **FULLY CONFIGURED AND RUNNING**
- Flask backend serving both API and static files on port 5000
- Frontend with video synchronization features working
- API tested with YouTube video extraction
- Deployment configured for production

## Technology Stack
- **Backend**: Python Flask, yt-dlp, asyncio
- **Frontend**: Plain HTML/CSS/JavaScript, hls.js, YouTube IFrame API
- **Video Processing**: yt-dlp for video extraction, HLS.js for streaming

## Project Architecture
```
├── backend/
│   └── app/
│       └── main.py          # Flask server (API + static file serving)
├── frontend/
│   └── public/
│       ├── index.html       # Main UI with 2x2 video grid
│       └── app.js          # Video sync logic, player management
├── requirements.txt         # Python dependencies
└── README.md               # Original project documentation
```

## Key Features
1. **Multi-pane video loading**: 4 synchronized video players in 2x2 grid
2. **Video extraction**: Uses yt-dlp to extract playable streams from YouTube/Vimeo
3. **Master controls**: Global play/pause/seek/volume/speed controls
4. **Drift correction**: Automatic synchronization every 1s with 300ms tolerance
5. **Multiple formats**: Supports both MP4 direct streams and HLS streaming
6. **Responsive design**: Clean dark theme with modern UI

## Recent Changes
- **2025-09-25**: Initial Replit environment setup
  - Installed Python 3.11 and Flask dependencies
  - Configured Flask server for Replit (0.0.0.0:5000, cache control headers)
  - Set up workflow for combined frontend/backend serving
  - Tested API functionality with YouTube video extraction
  - Configured autoscale deployment for production

## API Usage
```bash
# Test video extraction
curl -X POST http://localhost:5000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## Deployment
- **Target**: Autoscale (stateless web application)
- **Command**: `python backend/app/main.py`
- **Port**: 5000 (serves both API and static files)

## User Preferences
- Clean, minimal setup maintaining original architecture
- Single Flask server handling both backend API and frontend serving
- Focus on video synchronization functionality