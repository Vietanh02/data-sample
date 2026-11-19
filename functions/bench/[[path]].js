export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const acceptHeader = request.headers.get('Accept') || '';

  // 1. Nếu Agent yêu cầu JSON trực tiếp tại /bench hoặc /bench/
  if (
    (url.pathname === '/bench' || url.pathname === '/bench/') &&
    acceptHeader.includes('application/json')
  ) {
    const manifestUrl = new URL('/bench/manifest.json', url.origin);
    const res = await env.ASSETS.fetch(manifestUrl);
    return new Response(res.body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }

  // 2. Lấy tài nguyên tĩnh từ Cloudflare Assets
  let response = await env.ASSETS.fetch(request);

  // 3. Nếu Agent truy cập vào một subfolder (VD: /bench/run-01/) chưa có index.html riêng,
  // tự động filter từ manifest.json để trả về đúng danh sách file của subfolder đó!
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

  // 4. Bổ sung CORS & Header thân thiện với Agent cho mọi file trong /bench
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('X-Content-Type-Options', 'nosniff');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

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