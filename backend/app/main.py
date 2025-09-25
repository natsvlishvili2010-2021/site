from flask import Flask, request, jsonify, send_from_directory, make_response
from pathlib import Path
import urllib.parse as up
from typing import List
import yt_dlp
import asyncio
from contextlib import asynccontextmanager
try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except Exception:
    PLAYWRIGHT_AVAILABLE = False

# Resolve absolute path to frontend/public to avoid 404 from relative CWD
PROJECT_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = PROJECT_ROOT / 'frontend' / 'public'
app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path='/static')

SAFE_PROVIDERS = {'youtube', 'youtu.be', 'vimeo'}


@app.after_request
def add_cors_headers(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    # Add cache control to prevent caching issues in Replit environment
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


@app.route('/')
def index():
    return send_from_directory(str(PUBLIC_DIR), 'index.html')

@app.route('/index.html')
def index_html():
    return send_from_directory(str(PUBLIC_DIR), 'index.html')

@app.route('/movies')
def movies():
    return send_from_directory(str(PUBLIC_DIR), 'movies.html')


@app.route('/api/fetch', methods=['POST', 'OPTIONS'])
def fetch():
    if request.method == 'OPTIONS':
        return make_response(('', 204))

    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip()
    if not url:
        return jsonify({'status': 'error', 'message': 'Missing URL'}), 400

    try:
        parsed = up.urlparse(url)
        host = (parsed.netloc or '').lower()
    except Exception:
        return jsonify({'status': 'error', 'message': 'Invalid URL'}), 400
    # Allow any host; yt-dlp will attempt extraction and may still fail for DRM/login/geo-block

    # Forward useful headers from the browser to improve success rate
    ua = request.headers.get('User-Agent') or 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
    ref = request.headers.get('Referer') or url
    cookie = request.headers.get('Cookie')
    accept_lang = request.headers.get('Accept-Language') or 'en-US,en;q=0.9'

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'skip_download': True,
        'restrictfilenames': True,
        'extractor_args': {
            # Hint yt-dlp to impersonate a modern Chrome for generic/spankbang
            'generic': {'impersonate': ['chrome']},
            'spankbang': {'impersonate': ['chrome']},
        },
        'http_headers': {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': accept_lang,
            'Referer': ref,
            **({'Cookie': cookie} if cookie else {}),
        },
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as e:
        # Try Playwright fallback for sites blocking API (e.g., 403)
        if PLAYWRIGHT_AVAILABLE:
            meta = asyncio.run(_playwright_extract(url))
            if meta:
                return jsonify({'status': 'ok', 'provider': 'playwright', 'title': meta.get('title'), 'duration': None, 'sources': meta['sources'], 'ttl_seconds': 1800})
        return jsonify({'status': 'error', 'message': str(e)})
    except Exception:
        return jsonify({'status': 'error', 'message': 'Extraction failed'})

    title = info.get('title')
    duration = info.get('duration')
    extractor = (info.get('extractor_key') or 'unknown').lower()

    # Rank formats and pick the single best quality (prefer highest resolution/bitrate)
    fmts = info.get('formats') or []
    candidates: List[dict] = []
    for f in fmts:
        f_url = f.get('url')
        if not f_url:
            continue
        proto = (f.get('protocol') or '')
        ext = (f.get('ext') or '')
        vcodec = f.get('vcodec')
        acodec = f.get('acodec')
        # Skip audio-only
        if vcodec == 'none':
            continue
        # Type
        typ = 'hls' if 'm3u8' in proto else ('mp4' if ext == 'mp4' else None)
        if not typ:
            continue
        height = f.get('height') or 0
        width = f.get('width') or 0
        tbr = f.get('tbr') or 0  # total bitrate
        size = f.get('filesize') or f.get('filesize_approx') or 0
        # Score: resolution first, then bitrate, then known filesize
        score = int(height * width) * 1_000 + int(tbr * 1_000) + int(size)
        candidates.append({'type': typ, 'url': f_url, 'score': score})

    if not candidates:
        return jsonify({'status': 'error', 'message': 'No playable sources found'})

    best = max(candidates, key=lambda c: c['score'])
    return jsonify({
        'status': 'ok',
        'provider': extractor,
        'title': title,
        'duration': float(duration) if duration is not None else None,
        'sources': [{'type': best['type'], 'url': best['url']}],
        'ttl_seconds': 3600,
    })


async def _playwright_extract(page_url: str):
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                ignore_https_errors=True,
            )
            page = await context.new_page()
            await page.route('**/*', lambda route: route.continue_())
            await page.goto(page_url, wait_until='domcontentloaded', timeout=45000)
            # Wait a bit for players to initialize
            await page.wait_for_timeout(3000)

            # Try to find m3u8/mp4 URLs in network logs
            found = []
            for req in page.context.requests:
                u = req.url
                if '.m3u8' in u or '.mp4' in u:
                    typ = 'hls' if '.m3u8' in u else 'mp4'
                    found.append({'type': typ, 'url': u})
            if not found:
                # Fallback: scan HTML
                html = await page.content()
                import re
                m3u8s = set(re.findall(r'https?://[^"\'\s>]+\.m3u8[^"\'\s<]*', html, flags=re.IGNORECASE))
                mp4s = set(re.findall(r'https?://[^"\'\s>]+\.mp4[^"\'\s<]*', html, flags=re.IGNORECASE))
                for u in m3u8s:
                    found.append({'type': 'hls', 'url': u})
                for u in mp4s:
                    found.append({'type': 'mp4', 'url': u})

            await context.close()
            await browser.close()
            if not found:
                return None
            # Return best-priority first: prefer MP4
            found.sort(key=lambda s: 0 if s['type']=='mp4' else 1)
            return {'title': None, 'sources': found[:2]}
    except Exception:
        return None


if __name__ == "__main__":
    # For Replit environment: bind to 0.0.0.0:5000 for frontend access
    # Since this Flask app serves both API and static files, it acts as the frontend server
    app.run(host="0.0.0.0", port=5000, debug=True)
