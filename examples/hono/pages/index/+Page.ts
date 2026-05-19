// Simple HTML page to test the API endpoints
export default function Page() {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>vike-api-router example</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; }
    button { margin: 4px; padding: 8px 14px; cursor: pointer; }
    h2 { margin-top: 32px; }
  </style>
</head>
<body>
  <h1>vike-api-router</h1>
  <p>Open DevTools → Network to see the requests.</p>

  <h2>GET /api — health check</h2>
  <button onclick="fetchApi('/api')">Fetch /api</button>
  <pre id="api-root"></pre>

  <h2>GET /api/health (any method via +all.ts)</h2>
  <button onclick="fetchApi('/api/health')">GET /api/health</button>
  <button onclick="fetchApi('/api/health', 'POST')">POST /api/health</button>
  <pre id="api-health"></pre>

  <h2>GET /api/users (requires x-api-key header)</h2>
  <button onclick="fetchApi('/api/users', 'GET', { 'x-api-key': 'secret' })">With key</button>
  <button onclick="fetchApi('/api/users')">Without key (401)</button>
  <pre id="api-users"></pre>

  <h2>GET /api/users/:id</h2>
  <button onclick="fetchApi('/api/users/1', 'GET', { 'x-api-key': 'secret' })">User 1</button>
  <button onclick="fetchApi('/api/users/999', 'GET', { 'x-api-key': 'secret' })">User 999 (404)</button>
  <pre id="api-user-id"></pre>

  <h2>GET /robots.txt (custom route)</h2>
  <button onclick="fetchApi('/robots.txt')">Fetch robots.txt</button>
  <pre id="robots"></pre>

  <h2>RPC handlers (/_rpc/)</h2>
  <button onclick="callRpc('userHandler', 'listUsers', [])">listUsers()</button>
  <button onclick="callRpc('userHandler', 'getUser', ['1'])">getUser('1')</button>
  <pre id="rpc"></pre>

  <script>
    async function fetchApi(url, method = 'GET', headers = {}) {
      const key = url.replace(/[^a-z]/gi, '-').replace(/-+/g, '-') || 'root'
      const el = document.getElementById('api-' + key) ?? document.getElementById(key.replace('/api', 'api'))
      const res = await fetch(url, { method, headers })
      const text = await res.text()
      let out
      try { out = JSON.stringify(JSON.parse(text), null, 2) } catch { out = text }
      ;(el ?? document.getElementById('api-root')).textContent = \`\${res.status} \${res.statusText}\\n\${out}\`
    }

    async function callRpc(handler, fn, args) {
      const el = document.getElementById('rpc')
      const res = await fetch(\`/_rpc/\${handler}/\${fn}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      const data = await res.json()
      el.textContent = \`\${res.status} \${res.statusText}\\n\${JSON.stringify(data, null, 2)}\`
    }
  </script>
</body>
</html>
  `
  return html
}
