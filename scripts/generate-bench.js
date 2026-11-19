import fs from 'node:fs';
import path from 'node:path';

const BENCH_DIR = path.resolve('public/bench');

function scanDirectory(dir, baseUrl = '/bench') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    // Bỏ qua các file hệ thống do script tự sinh ra
    if (entry.name === 'index.html' || entry.name === 'manifest.json' || entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const urlPath = `${baseUrl}/${entry.name}`;
    const stats = fs.statSync(fullPath);

    if (entry.isDirectory()) {
      items.push({
        name: entry.name,
        type: 'directory',
        path: `${urlPath}/`,
        children: scanDirectory(fullPath, urlPath),
      });
    } else {
      items.push({
        name: entry.name,
        type: 'file',
        path: urlPath,
        size_bytes: stats.size,
        modified_at: stats.mtime.toISOString(),
        ext: path.extname(entry.name).replace('.', '') || 'unknown',
      });
    }
  }

  // Sắp xếp thư mục lên trước, sau đó theo tên A-Z
  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function renderHtmlTree(nodes, indent = '') {
  let lines = [];
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const branch = isLast ? '└── ' : '├── ';
    const nextIndent = indent + (isLast ? '    ' : '│   ');

    if (node.type === 'directory') {
      lines.push(
        `${indent}${branch}<a href="${node.path}" data-type="dir"><strong>${node.name}/</strong></a>`
      );
      if (node.children && node.children.length > 0) {
        lines.push(renderHtmlTree(node.children, nextIndent));
      }
    } else {
      const sizeKb = (node.size_bytes / 1024).toFixed(2);
      lines.push(
        `${indent}${branch}<a href="${node.path}" data-type="file" data-size="${node.size_bytes}">${node.name}</a> <span class="meta">(${sizeKb} KB | ${node.modified_at})</span>`
      );
    }
  });
  return lines.join('\n');
}

// 1. Quét cấu trúc
if (!fs.existsSync(BENCH_DIR)) {
  fs.mkdirSync(BENCH_DIR, { recursive: true });
}
const tree = scanDirectory(BENCH_DIR);

// 2. Xuất file manifest.json (Tối ưu nhất cho Agent gọi API/Script)
const manifest = {
  root: '/bench/',
  generated_at: new Date().toISOString(),
  machine_readable_hint: 'Fetch any file directly via its path property.',
  tree,
};
fs.writeFileSync(path.join(BENCH_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

// 3. Xuất file index.html tĩnh (Tối ưu cho LLM/Agent đọc HTML thuần)
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <meta name="agent-manifest" content="/bench/manifest.json">
  <title>Benchmark Artifacts Index (/bench)</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; line-height: 1.5; padding: 2rem; max-width: 960px; margin: 0 auto; background: #0d1117; color: #c9d1d9; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .meta { color: #8b949e; font-size: 0.85em; }
    .notice { background: #161b22; border: 1px solid #30363d; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-size: 0.9em; }
    pre { overflow-x: auto; }
  </style>
</head>
<body>
  <header>
    <h1>Index of /bench/</h1>
    <div class="notice">
      <strong>AI Agent Note:</strong> Full structured JSON tree is available at <a href="/bench/manifest.json">/bench/manifest.json</a> or by requesting this URL with header <code>Accept: application/json</code>.
    </div>
  </header>
  <main>
    <nav aria-label="Directory Tree">
<pre>
/bench/
${renderHtmlTree(tree)}
</pre>
    </nav>
  </main>
</body>
</html>`;

fs.writeFileSync(path.join(BENCH_DIR, 'index.html'), htmlContent);
console.log('✅ Generated /bench/index.html and /bench/manifest.json successfully.');