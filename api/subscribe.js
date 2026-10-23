// Vercel serverless function : POST /api/subscribe
// Variables d'environnement (Vercel > Settings > Environment Variables) :
//   RESEND_API_KEY     clé API Resend (envoi du mail d'accès)
//   MAIL_FROM          ex. AVID Performance Lab <contact@avidlab.fr>  (domaine vérifié dans Resend)
//   COACH_LINK         lien d'inscription coach (adresse du dashboard + ?mode=signup)
//   SOLO_LINK          (optionnel) défaut : https://avid-athlete.vercel.app/?mode=solo
//   NOTIFY_TO          (optionnel) adresse qui reçoit une alerte à chaque inscription (défaut contact@avidlab.fr)
//   TURNSTILE_SECRET   (optionnel) clé secrète Cloudflare Turnstile
//   ALLOWED_ORIGIN     ex. https://www.avidlab.fr (optionnel mais recommandé)

const TYPES = ['coach', 'solo'];
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

// Extrait une adresse https propre, même si la variable contient du format « [lien](lien) »
function cleanUrl(value, fallback) {
  const m = String(value || '').match(/https?:\/\/[^\s\]\)\[\(<>"']+/);
  return m ? m[0] : fallback;
}

const MAILS = {
  coach: {
    subject: 'Ton accès au Dashboard Coach AVID',
    title: 'Bienvenue sur le Dashboard Coach',
    intro: 'Suis tes athlètes : programmes, charges, RPE et progression sur un seul écran. Première visite ? Clique sur « Première connexion ? » pour créer ton compte. Ensuite, ce même lien te sert à te connecter : enregistre-le dans tes favoris.',
    button: 'Accéder à mon espace coach',
    link: () => cleanUrl(process.env.COACH_LINK, 'https://www.avidlab.fr/membre-coach')
  },
  solo: {
    subject: 'Ton accès à l\'App Athlète Solo AVID',
    title: 'Bienvenue sur l\'App Athlète Solo',
    intro: 'Construis ton programme, note tes charges et suis ta progression en autonomie. Clique sur le bouton pour créer ton compte (3 étapes, 2 minutes). Ensuite, enregistre le lien de connexion ci-dessous dans tes favoris.',
    button: 'Créer mon compte solo',
    link: () => cleanUrl(process.env.SOLO_LINK, 'https://avid-athlete.vercel.app/?mode=solo'),
    secondary: () => ({ label: 'Déjà un compte ? Connecte-toi ici :', url: cleanUrl(process.env.SOLO_LOGIN_LINK, 'https://www.avidlab.fr/membre-solo') })
  }
};

function renderMail(kind) {
  const m = MAILS[kind];
  const url = m.link();
  const sec = m.secondary ? m.secondary() : null;
  const secondaryHtml = sec
    ? `<p style="font-size:13px;line-height:1.6;color:#666;margin:0 0 24px;">${sec.label}<br><a href="${sec.url}" style="color:#E63946;word-break:break-all;">${sec.url}</a></p>`
    : '';
  const secondaryText = sec ? `\n\n${sec.label} ${sec.url}` : '';
  const html = `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#141920;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:32px 28px;">
<tr><td>
<div style="font-size:12px;letter-spacing:3px;font-weight:700;color:#E63946;">AVID PERFORMANCE LAB</div>
<h1 style="font-size:24px;line-height:1.2;color:#141920;margin:12px 0 8px;">${m.title}</h1>
<p style="font-size:15px;line-height:1.6;color:#333;margin:0 0 24px;">${m.intro}</p>
<p style="margin:0 0 24px;"><a href="${url}" style="display:inline-block;background:#E63946;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:6px;">${m.button}</a></p>
<p style="font-size:13px;line-height:1.6;color:#666;margin:0 0 6px;">Si le bouton ne fonctionne pas, copie cette adresse dans ton navigateur :</p>
<p style="font-size:13px;line-height:1.6;color:#666;word-break:break-all;margin:0 0 24px;"><a href="${url}" style="color:#E63946;">${url}</a></p>
${secondaryHtml}
<div style="background:#f6f6f4;border-radius:8px;padding:16px 18px;margin:0 0 24px;">
<p style="font-size:14px;font-weight:700;color:#141920;margin:0 0 8px;">Garde l'application sur ton écran d'accueil</p>
<p style="font-size:13px;line-height:1.6;color:#444;margin:0 0 8px;">Une fois ton compte créé et connecté, ajoute l'application à ton téléphone pour l'ouvrir comme une vraie app :</p>
<p style="font-size:13px;line-height:1.6;color:#444;margin:0 0 6px;"><strong>iPhone (Safari)</strong> : ouvre l'application dans Safari, touche le bouton Partager (le carré avec une flèche vers le haut), puis « Sur l'écran d'accueil », puis « Ajouter ».</p>
<p style="font-size:13px;line-height:1.6;color:#444;margin:0;"><strong>Android (Chrome)</strong> : ouvre l'application dans Chrome, touche le menu ⋮ en haut à droite, puis « Ajouter à l'écran d'accueil » (ou « Installer l'application »), puis confirme.</p>
</div>
<p style="font-size:13px;line-height:1.6;color:#666;margin:0;">Une question ? Réponds à cet e-mail ou écris à contact@avidlab.fr.</p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px;">
<p style="font-size:11px;line-height:1.5;color:#999;margin:0;">Tu reçois cet e-mail parce que tu as demandé un accès sur avidlab.fr. Si ce n'est pas toi, ignore-le. <a href="https://www.avidlab.fr/legal#confidentialite" style="color:#999;">Confidentialité</a></p>
</td></tr></table></body></html>`;
  const text = `${m.title}\n\n${m.intro}\n\n${m.button} : ${url}${secondaryText}\n\nGARDE L'APPLICATION SUR TON ÉCRAN D'ACCUEIL\nUne fois connecté :\n- iPhone (Safari) : bouton Partager, puis « Sur l'écran d'accueil », puis « Ajouter ».\n- Android (Chrome) : menu ⋮, puis « Ajouter à l'écran d'accueil » ou « Installer l'application ».\n\nUne question ? Écris à contact@avidlab.fr.\n\nTu reçois cet e-mail parce que tu as demandé un accès sur avidlab.fr. Si ce n'est pas toi, ignore-le.`;
  return { subject: m.subject, html, text };
}

async function sendAccessMail(to, kind) {
  const { subject, html, text } = renderMail(kind);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [to],
      reply_to: 'contact@avidlab.fr',
      subject, html, text
    })
  });
  if (!r.ok) throw new Error(`Resend ${r.status} ${await r.text()}`);
}

async function notifyOwner(email, type) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [process.env.NOTIFY_TO || 'contact@avidlab.fr'],
      subject: `Nouvelle inscription ${type}`,
      text: `Nouvelle demande d'accès (${type}) : ${email}`
    })
  });
  if (!r.ok) throw new Error(`Resend notif ${r.status} ${await r.text()}`);
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

  // Coach / solo : on envoie d'abord le mail d'accès (c'est la demande de la personne)
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
    console.error('RESEND_API_KEY ou MAIL_FROM manquant');
    return res.status(500).json({ error: 'Service mal configuré.' });
  }
  try {
    await sendAccessMail(email, type);
  } catch (e) {
    console.error('Mail d\'accès :', e.message);
    return res.status(502).json({ error: 'Envoi du mail impossible pour le moment. Réessaie plus tard.' });
  }

  // Alerte pour toi (garde une trace de l'inscription), sans bloquer si ça échoue
  try {
    await notifyOwner(email, type);
  } catch (e) {
    console.error('Alerte inscription :', e.message);
  }
  return res.status(200).json({ ok: true });
};

function safeJson(t) { try { return JSON.parse(t); } catch { return {}; } }

module.exports.renderMail = renderMail;
