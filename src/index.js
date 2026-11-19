export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const acceptHeader = request.headers.get('Accept') || '';

    // 0. Chuyển hướng từ / sang /bench/
    if (url.pathname === '/') {
      return Response.redirect(`${url.origin}/bench/${url.search}`, 302);
    }

    // Chỉ xử lý logic đặc biệt cho đường dẫn /bench
    if (url.pathname === '/bench' || url.pathname.startsWith('/bench/')) {
      // 1. Trả về manifest.json nếu Agent gửi header Accept: application/json tại /bench
      if (
        (url.pathname === '/bench' || url.pathname === '/bench/') &&
        acceptHeader.includes('application/json')
      ) {
        const res = await env.ASSETS.fetch(new URL('/bench/manifest.json', url.origin));
        return new Response(res.body, {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=60',
          },
        });
      }

      // 2. Lấy tài nguyên tĩnh từ Assets
      let response = await env.ASSETS.fetch(request);

      // 3. Nếu truy cập vào subfolder (VD: /bench/run-01/) chưa có index.html riêng
      if (response.status === 404 && !url.pathname.split('/').pop().includes('.')) {
        const normalizedPath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
        const manifestRes = await env.ASSETS.fetch(new URL('/bench/manifest.json', url.origin));

        if (manifestRes.ok) {
          const manifest = await manifestRes.json();
          const targetNode = findNodeByPath(manifest.tree, normalizedPath);

          if (targetNode && targetNode.type === 'directory') {
            if (acceptHeader.includes('application/json')) {
              return Response.json(targetNode, {
                headers: { 'Access-Control-Allow-Origin': '*' },
              });
            }
            return new Response(renderSubfolderHtml(targetNode), {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          }
        }
      }

      // 4. Bổ sung CORS headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('X-Content-Type-Options', 'nosniff');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    // Các đường dẫn khác ngoài /bench phục vụ trực tiếp từ public/
    return env.ASSETS.fetch(request);
  },
};

function findNodeByPath(nodes, targetPath) {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.type === 'directory' && node.children) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function renderSubfolderHtml(dirNode) {
  const listItems = dirNode.children
    .map((child) => {
      const meta =
        child.type === 'file' ? ` (${(child.size_bytes / 1024).toFixed(2)} KB)` : ' [DIR]';
      return `<li><a href="${child.path}">${child.name}</a>${meta}</li>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Index of ${dirNode.path}</title>
  <style>body { font-family: monospace; padding: 2rem; background: #0d1117; color: #c9d1d9; } a { color: #58a6ff; }</style>
</head>
<body>
  <h1>Index of ${dirNode.path}</h1>
  <p><a href="/bench/">.. (Back to /bench/)</a></p>
  <ul>
    ${listItems}
  </ul>
</body>
</html>`;
}