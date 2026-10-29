"""Small immutable asset bundle, built in memory from checked-in sources at startup."""
import hashlib
import re
from fastapi import HTTPException
from fastapi.responses import Response


class FrontendBundle:
    def __init__(self, directory):
        self.assets = {}
        html = (directory / 'index.html').read_text(encoding='utf-8')
        def replace(match):
            path = match.group(1)
            content = (directory / path).read_bytes()
            digest = hashlib.sha256(content).hexdigest()[:20]
            key = f'{digest}/{path}'
            self.assets[key] = (content, 'text/css' if path.endswith('.css') else 'application/javascript')
            return '/static/' + key
        self.html = re.sub(r'(?:/)?((?:js|css)/[\w.-]+\.(?:js|css))(?:\?v=[\w.-]+)?', replace, html).encode()
        self.etag = '"' + hashlib.sha256(self.html).hexdigest() + '"'

    def index(self, request):
        headers = {'Cache-Control': 'no-cache', 'ETag': self.etag}
        if request.headers.get('if-none-match') == self.etag:
            return Response(status_code=304, headers=headers)
        return Response(self.html, media_type='text/html', headers=headers)

    def asset(self, key):
        if key not in self.assets:
            raise HTTPException(404, '资源不存在，请刷新页面')
        content, media_type = self.assets[key]
        return Response(content, media_type=media_type,
                        headers={'Cache-Control': 'public, max-age=31536000, immutable'})
