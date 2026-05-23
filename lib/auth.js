// Basic Auth opcional. Si BASIC_AUTH_USER y BASIC_AUTH_PASS están definidos,
// protege TODAS las rutas. Si no, deja pasar (modo dev local).

export function basicAuth(req, res, next) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return next();

  // Health endpoint siempre libre para que Render pueda hacer healthcheck.
  if (req.path === '/healthz') return next();

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Renderz Studio"');
    return res.status(401).send('Auth required');
  }
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    if (u === user && p === pass) return next();
  } catch (_) { /* fallthrough */ }

  res.set('WWW-Authenticate', 'Basic realm="Renderz Studio"');
  return res.status(401).send('Bad credentials');
}
