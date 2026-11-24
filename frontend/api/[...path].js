// Same-origin API proxy. Set CHANDRAHASA_API_URL in Vercel Project Environment Variables.
// Example value: https://your-real-backend.onrender.com
const ALLOWED = new Set(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']);
export default async function handler(req, res) {
  const base = process.env.CHANDRAHASA_API_URL;
  if (!base) return res.status(503).json({ error: 'Store API is not configured. Set CHANDRAHASA_API_URL.' });
  if (!ALLOWED.has(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    const rawPath = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean);
    if (rawPath.some(part => part === '.' || part === '..' || /[\\/]/.test(part))) return res.status(400).json({ error: 'Invalid API path' });
    const target = new URL('/api/' + rawPath.map(encodeURIComponent).join('/'), base.endsWith('/') ? base : base + '/');
    const query = new URL(req.url, 'https://vercel.invalid').searchParams;
    query.delete('path');
    for (const [key, value] of query) target.searchParams.append(key, value);
    const headers = new Headers();
    for (const name of ['accept','content-type','cookie','x-csrf-token','authorization','idempotency-key','user-agent']) {
      const value = req.headers[name]; if (value) headers.set(name, Array.isArray(value) ? value.join(',') : value);
    }
    headers.set('x-forwarded-host', req.headers.host || '');
    headers.set('x-forwarded-proto', 'https');
    let body;
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const chunks=[]; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      body = Buffer.concat(chunks);
      if (body.length > 2 * 1024 * 1024) return res.status(413).json({ error: 'Request body too large' });
    }
    const upstream = await fetch(target, { method:req.method, headers, body, redirect:'manual', signal:AbortSignal.timeout(25000) });
    res.status(upstream.status);
    for (const name of ['content-type','cache-control','retry-after']) {
      const value = upstream.headers.get(name); if (value) res.setHeader(name, value);
    }
    const cookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    else { const cookie = upstream.headers.get('set-cookie'); if (cookie) res.setHeader('Set-Cookie', cookie); }
    res.setHeader('Cache-Control', 'no-store');
    const bytes = Buffer.from(await upstream.arrayBuffer());
    return res.send(bytes);
  } catch (error) {
    return res.status(502).json({ error: 'Store API is temporarily unavailable' });
  }
}
