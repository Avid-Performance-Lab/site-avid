// Vercel serverless function : POST /api/feedback
// Envoie le message du formulaire « Ton avis » à contact@avidlab.fr via Resend.
// Variables : RESEND_API_KEY, MAIL_FROM, (optionnel) FEEDBACK_TO, ALLOWED_ORIGIN

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 3;

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
  if (body.website) return res.status(200).json({ ok: true }); // honeypot

  const message = String(body.message || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (message.length < 5) return res.status(400).json({ error: 'Écris un petit message avant d\'envoyer.' });
  if (message.length > 1000) return res.status(400).json({ error: 'Message trop long (1000 caractères maximum).' });
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Trop de messages. Réessaie dans quelques minutes.' });

  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
    console.error('RESEND_API_KEY ou MAIL_FROM manquant');
    return res.status(500).json({ error: 'Service mal configuré.' });
  }

  try {
    const payload = {
      from: process.env.MAIL_FROM,
      to: [process.env.FEEDBACK_TO || 'contact@avidlab.fr'],
      subject: 'Idée / retour AVID',
      // Texte brut uniquement : le message d'un visiteur n'est jamais interprété comme du HTML
      text: `${message}\n\n— ${email || 'e-mail non communiqué'}`
    };
    if (email) payload.reply_to = email;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      console.error('Resend feedback', r.status, await r.text());
      return res.status(502).json({ error: 'Envoi impossible pour le moment. Réessaie plus tard.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Feedback :', e);
    return res.status(502).json({ error: 'Envoi impossible pour le moment. Réessaie plus tard.' });
  }
};

function safeJson(t) { try { return JSON.parse(t); } catch { return {}; } }
