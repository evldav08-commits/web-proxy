const express = require('express');
const rateLimit = require('express-rate-limit');
const got = require('got');
const cheerio = require('cheerio');
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const ipaddr = require('ipaddr.js');
const path = require('node:path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_BYTES = Number(process.env.MAX_RESPONSE_BYTES || 8 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const MAX_REDIRECTS = 5;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use('/proxy', rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Rate limit reached. Please wait a minute.'
}));

function publicAddress(address) {
  try {
    const parsed = ipaddr.parse(address);
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length || addresses.some(x => !publicAddress(x.address))) {
      return callback(new Error('The destination resolves to a non-public IP address.'));
    }
    const chosen = addresses[0];
    callback(null, chosen.address, chosen.family);
  });
}

function validateUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('Enter a valid URL.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  if (u.username || u.password) throw new Error('URLs containing credentials are not allowed.');
  if (!u.hostname || u.hostname === 'localhost' || u.hostname.endsWith('.localhost') || u.hostname.endsWith('.local')) {
    throw new Error('That destination is not allowed.');
  }
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('Only standard web ports (80 and 443) are allowed.');
  if (ipaddr.isValid(u.hostname) && !publicAddress(u.hostname)) throw new Error('Private or reserved IP addresses are blocked.');
  return u;
}

function rewriteHtml(html, upstreamUrl) {
  const $ = cheerio.load(html);
  const proxyPath = value => {
    if (!value || value.startsWith('#') || /^(data:|javascript:|mailto:|tel:)/i.test(value)) return value;
    try {
      const absolute = new URL(value, upstreamUrl).href;
      return '/proxy?url=' + encodeURIComponent(absolute);
    } catch { return value; }
  };
  $('a[href], area[href], link[href], script[src], img[src], iframe[src], source[src], video[src], audio[src], form[action]').each((_, el) => {
    const attr = $(el).is('form') ? 'action' :
      (['script','img','iframe','source','video','audio'].includes(el.tagName) ? 'src' : 'href');
    const value = $(el).attr(attr);
    if (value) $(el).attr(attr, proxyPath(value));
  });
  $('form').each((_, el) => $(el).attr('method', 'get'));
  $('base').remove();
  return $.html();
}

app.get('/proxy', async (req, res) => {
  try {
    let current = validateUrl(String(req.query.url || ''));
    let upstream;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      validateUrl(current.href);
      const agent = {
        http: new http.Agent({ keepAlive: false, lookup: safeLookup }),
        https: new https.Agent({ keepAlive: false, lookup: safeLookup })
      };
      upstream = await got(current.href, {
        method: 'GET', agent, followRedirect: false, throwHttpErrors: false,
        responseType: 'buffer', timeout: { request: TIMEOUT_MS },
        maxResponseSize: MAX_BYTES,
        headers: { 'user-agent': 'VPS-Web-Proxy/1.0', accept: req.get('accept') || '*/*' }
      });
      if ([301, 302, 303, 307, 308].includes(upstream.statusCode) && upstream.headers.location) {
        if (hop === MAX_REDIRECTS) throw new Error('Too many redirects.');
        current = new URL(upstream.headers.location, current);
        continue;
      }
      break;
    }
    const type = String(upstream.headers['content-type'] || 'application/octet-stream');
    res.status(upstream.statusCode);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Cache-Control', 'no-store');
    if (/text\/html/i.test(type)) {
      res.type('html');
      res.set('Content-Security-Policy', "sandbox allow-scripts allow-forms allow-popups; default-src * data: blob: 'unsafe-inline' 'unsafe-eval';");
      return res.send(rewriteHtml(upstream.body.toString('utf8'), current.href));
    }
    if (/^(text\/|application\/(json|javascript|xml)|image\/|font\/)/i.test(type)) {
      res.set('Content-Type', type);
      return res.send(upstream.body);
    }
    res.status(415).type('text').send('This content type is not displayed by the web proxy.');
  } catch (err) {
    const status = /valid URL|allowed|standard web ports|HTTP and HTTPS|credentials|IP address|redirects/i.test(err.message) ? 400 : 502;
    res.status(status).type('text').send(err.message || 'Proxy request failed.');
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(PORT, '0.0.0.0', () => console.log(`Web proxy listening on ${PORT}`));
