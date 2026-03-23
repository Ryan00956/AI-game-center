import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Use a plugin to handle the proxy instead of built-in proxy
    // This gives us full control over the target URL per request
  },
  plugins: [llmProxyPlugin()],
});

/**
 * Custom Vite plugin that proxies /api/chat requests to LLM APIs.
 * 
 * The frontend POSTs to /api/chat with:
 * - Header "X-Target-URL": the actual LLM API endpoint (e.g. https://llm.xiaochisaas.com/v1/chat/completions)
 * - Header "Authorization": Bearer <key>
 * - Body: the chat completion request JSON
 * 
 * This plugin forwards the request server-side, avoiding CORS entirely.
 */
function llmProxyPlugin() {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Method not allowed' } }));
          return;
        }

        const targetUrl = req.headers['x-target-url'];
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Missing X-Target-URL header' } }));
          return;
        }

        // Read request body
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        try {
          // Forward the request to the actual LLM API
          const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': req.headers['authorization'] || '',
            },
            body,
          });

          const data = await response.text();

          // Forward the response back
          res.writeHead(response.status, {
            'Content-Type': response.headers.get('content-type') || 'application/json',
          });
          res.end(data);
        } catch (err) {
          console.error('[LLM Proxy Error]', err.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: { message: `代理请求失败: ${err.message}` }
          }));
        }
      });
    },
  };
}
