// A stand-in for https://citedby.eu/api/check so no test touches the network. Not a test file.
import http from 'node:http';

const FIVE = ['OAI-SearchBot', 'GPTBot', 'PerplexityBot', 'Google-Extended', 'Bingbot'];

export const RESULT_MIXED = {
  ok: true,
  site: 'https://shop.example',
  reachable: true,
  snapshot: null,
  checks: [
    { id: 'crawlers', status: 'fail', blocked: ['GPTBot', 'PerplexityBot'], checked: FIVE, robots_found: true },
    { id: 'raw_text', status: 'warn', words: 80 },
    { id: 'org_schema', status: 'fail', found: [] },
    { id: 'product_schema', status: 'pass' },
    { id: 'product_price', status: 'pass' },
    { id: 'llms_txt', status: 'info' },
    { id: 'product_availability', status: 'na' },
  ],
  product_page: 'https://shop.example/products/mug',
  summary: { pass: 2, fail: 2, warn: 1, na: 1 },
};

export const RESULT_CLEAN = {
  ok: true,
  site: 'https://good.example',
  reachable: true,
  snapshot: null,
  checks: [
    { id: 'crawlers', status: 'pass', blocked: [], checked: FIVE, robots_found: true },
    { id: 'raw_text', status: 'pass', words: 640 },
    { id: 'org_schema', status: 'pass', found: ['Organization'] },
    { id: 'llms_txt', status: 'info' },
  ],
  summary: { pass: 3, fail: 0, warn: 0, na: 0 },
};

/** Starts a local server that answers every POST with `reply`. `requests` collects what it received. */
export async function fakeApi(reply) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let json = null;
      try { json = JSON.parse(raw); } catch { /* the test asserts on json */ }
      requests.push({ method: req.method, path: req.url, headers: req.headers, raw, json });
      const send = () => {
        const body = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body);
        res.writeHead(reply.status, { 'content-type': typeof reply.body === 'string' ? 'text/plain' : 'application/json' });
        res.end(body);
      };
      if (reply.delayMs) setTimeout(send, reply.delayMs); else send();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/api/check`,
    requests,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}
