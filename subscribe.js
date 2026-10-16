// Vercel serverless function : POST /api/subscribe
// Variables d'environnement (Vercel > Settings > Environment Variables) :
//   BEEHIIV_API_KEY        clé API Beehiiv (jamais dans le HTML)
//   BEEHIIV_PUB_ID         ex. pub_07d0a784-... (à vérifier dans Beehiiv > Settings > API)
//   TURNSTILE_SECRET       (optionnel) clé secrète Cloudflare Turnstile
//   BEEHIIV_AUTOMATION_COACH / BEEHIIV_AUTOMATION_SOLO   (optionnel) ids d'automations
//                          qui envoient le lien membre (déclencheur « API »)
//   ALLOWED_ORIGIN         ex. https://avidlab.fr (optionnel mais recommandé)

const TYPES = ['coach', 'solo', 'newsletter'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Limite simple par IP (best-effort : mémoire de l'instance serverless)
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_HITS;
}

module.exports = async (req, res) => {
  const origin = process.env.ALLOWED_ORIGIN;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const email = String(body.email || '').trim().toLowerCase();
  const type = String(body.type || '');

  // Honeypot : un bot remplit ce champ. On répond OK sans rien faire.
  if (body.website) return res.status(200).json({ ok: true });

  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Type d\'inscription invalide.' });
  if (body.consent !== true) return res.status(400).json({ error: 'Le consentement est requis.' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans quelques minutes.' });

  // Cloudflare Turnstile (si configuré)
  if (process.env.TURNSTILE_SECRET) {
    try {
      const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET,
          response: String(body.turnstile || ''),
          remoteip: ip
        })
      }).then(r => r.json());
      if (!v.success) return res.status(400).json({ error: 'Vérification anti-robot échouée.' });
    } catch (e) {
      return res.status(502).json({ error: 'Vérification indisponible. Réessaie.' });
    }
  }

  const key = process.env.BEEHIIV_API_KEY;
  const pub = process.env.BEEHIIV_PUB_ID;
  if (!key || !pub) return res.status(500).json({ error: 'Service mal configuré.' });

  const payload = {
    email,
    reactivate_existing: false,
    send_welcome_email: true,
    utm_source: 'avidlab.fr',
    utm_medium: 'site',
    utm_campaign: type,
    // Champ personnalisé à créer dans Beehiiv (Audience > Custom fields) : « type »
    custom_fields: [{ name: 'type', value: type }]
  };
  const automation =
    type === 'coach' ? process.env.BEEHIIV_AUTOMATION_COACH :
    type === 'solo' ? process.env.BEEHIIV_AUTOMATION_SOLO : null;
  if (automation) payload.automation_ids = [automation];

  try {
    const r = await fetch(`https://api.beehiiv.com/v2/publications/${encodeURIComponent(pub)}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      console.error('Beehiiv error', r.status, await r.text());
      return res.status(502).json({ error: 'Inscription impossible pour le moment. Réessaie plus tard.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Beehiiv fetch failed', e);
    return res.status(502).json({ error: 'Inscription impossible pour le moment. Réessaie plus tard.' });
  }
};

function safeJson(t) { try { return JSON.parse(t); } catch { return {}; } }
