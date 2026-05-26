// Multi-axis email classifier.
// Combina heurística rápida (regex + headers) con un pase semántico de Gemini
// para devolver una clasificación rica en múltiples ejes.

import { GoogleGenerativeAI } from '@google/generative-ai';

let model = null;

export function initClassifier(apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key || key === 'tu_clave_aqui') return;
  const genAI = new GoogleGenerativeAI(key);
  model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

// ────────────────────────────────────────────────
// Heurísticas locales (rápidas, sin red, sin coste)
// ────────────────────────────────────────────────

const AU_REGEX = {
  abn: /\bABN[:\s]*([0-9]{2}\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3})\b/i,
  gst: /\bGST\b/i,
  bsb: /\bBSB[:\s]*([0-9]{3}-?[0-9]{3})\b/i,
  amountAud: /A\$\s?([0-9][0-9,\.]*)/g,
  taxFileNumber: /\bTFN\b/i,
};

const NEWSLETTER_HINT = /(unsubscribe|list-unsubscribe|view in browser|preferences)/i;
const URGENT_HINT = /(urgent|asap|action required|today|reminder|due|overdue|payment failed)/i;
const RECEIPT_HINT = /(receipt|invoice|factura|recibo|payment received|order confirmation)/i;
const TRAVEL_HINT = /(flight|booking|itinerary|hotel|reservation|reserva|vuelo|qantas|airbnb|booking\.com)/i;

function heuristicAxes(email) {
  const corpus = `${email.subject || ''}\n${email.text || ''}\n${email.raw || ''}`;
  const axes = {};

  axes.is_newsletter = NEWSLETTER_HINT.test(corpus);
  axes.is_urgent = URGENT_HINT.test(`${email.subject || ''} ${email.text || ''}`);
  axes.is_receipt = RECEIPT_HINT.test(`${email.subject || ''} ${email.text || ''}`);
  axes.is_travel = TRAVEL_HINT.test(`${email.subject || ''} ${email.text || ''}`);
  axes.has_attachments = (email.attachments || []).length > 0;

  // Entidades fiscales AU (útil para yahoo.com.au)
  const abn = corpus.match(AU_REGEX.abn);
  const bsb = corpus.match(AU_REGEX.bsb);
  axes.au_entities = {
    abn: abn ? abn[1].replace(/\s/g, '') : null,
    has_gst: AU_REGEX.gst.test(corpus),
    bsb: bsb ? bsb[1] : null,
    has_tfn: AU_REGEX.taxFileNumber.test(corpus),
  };

  // Detección de gasto/importe
  const amounts = [];
  let m;
  const re = new RegExp(AU_REGEX.amountAud.source, 'g');
  while ((m = re.exec(corpus)) !== null) amounts.push(m[1]);
  axes.amounts_aud = amounts.slice(0, 5);

  // Dominio del remitente
  const domain = (email.from?.address || '').split('@')[1] || '';
  axes.sender_domain = domain;
  axes.sender_tld = domain.split('.').slice(-2).join('.');

  return axes;
}

// ────────────────────────────────────────────────
// Pase semántico (Gemini): topic, intent, sentiment, etc.
// ────────────────────────────────────────────────

const SEMANTIC_SCHEMA_PROMPT = `Eres un clasificador de email. Devuelves ESTRICTAMENTE JSON válido (sin markdown) con esta estructura:

{
  "topic": "string corto (1-3 palabras) en kebab-case, eg: 'finanzas-personales', 'viajes', 'trabajo', 'familia', 'newsletter-tech', 'impuestos-au'",
  "topic_label": "string legible en español, eg: 'Finanzas personales'",
  "intent": "uno de: informativo | accion-requerida | confirmacion | promocional | personal | factura | viaje | seguridad | otro",
  "urgency": "uno de: baja | media | alta",
  "sentiment": "uno de: positivo | neutro | negativo",
  "language": "iso-639-1, eg: 'es', 'en'",
  "entities": {
    "people": ["..."],
    "organizations": ["..."],
    "dates": ["..."],
    "money": ["..."]
  },
  "summary": "1 frase, máx 25 palabras, en español",
  "suggested_folder": "nombre de carpeta sugerido (kebab-case), eg: 'impuestos-au', 'viajes-2026'",
  "suggested_actions": ["responder" | "archivar" | "pagar" | "calendario" | "guardar-adjunto" | "borrar" | "ignorar"],
  "confidence": 0.0-1.0
}`;

async function semanticClassify(email) {
  if (!model) return null;
  const prompt = `${SEMANTIC_SCHEMA_PROMPT}

Email a clasificar:
DE: ${email.from?.name || ''} <${email.from?.address || ''}>
ASUNTO: ${email.subject || ''}
FECHA: ${email.date || ''}
CUERPO:
${(email.text || '').slice(0, 4000)}

Responde SOLO con el JSON.`;

  try {
    const result = await model.generateContent(prompt);
    const txt = result.response.text();
    const match = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
    const clean = (match ? match[1] : txt).trim();
    return JSON.parse(clean);
  } catch (e) {
    console.warn('[classifier] semantic fail:', e.message);
    return null;
  }
}

// Fallback sin LLM: topic deducido por reglas.
function ruleTopic(email, axes) {
  // Señales fuertes primero: dominio gov.au es siempre impuestos.
  if (/ato\.gov\.au/i.test(axes.sender_domain) || axes.au_entities.has_tfn) {
    return { topic: 'impuestos-au', topic_label: 'Impuestos AU', intent: 'factura' };
  }
  // Travel y receipt antes que GST genérico (un vuelo con GST sigue siendo "viaje").
  if (axes.is_travel) return { topic: 'viajes', topic_label: 'Viajes', intent: 'confirmacion' };
  if (axes.is_receipt) return { topic: 'facturas', topic_label: 'Facturas', intent: 'factura' };
  if (axes.au_entities.has_gst || axes.au_entities.abn) {
    return { topic: 'impuestos-au', topic_label: 'Impuestos AU', intent: 'factura' };
  }
  if (axes.is_newsletter) return { topic: 'newsletter', topic_label: 'Newsletter', intent: 'promocional' };
  if (/linkedin|seek|indeed/i.test(axes.sender_domain)) {
    return { topic: 'trabajo', topic_label: 'Trabajo', intent: 'informativo' };
  }
  if (/gmail|outlook|hotmail|yahoo/i.test(axes.sender_domain)) {
    return { topic: 'personal', topic_label: 'Personal', intent: 'personal' };
  }
  return { topic: 'otros', topic_label: 'Otros', intent: 'informativo' };
}

// ────────────────────────────────────────────────
// Scoring de match contra la query del usuario
// ────────────────────────────────────────────────

function matchScore(email, query) {
  const hay = `${email.from?.name || ''} ${email.from?.address || ''} ${email.subject || ''} ${email.text || ''}`.toLowerCase();
  let score = 0;
  if (query.from && hay.includes(query.from.toLowerCase())) score += 3;
  if (query.subject && (email.subject || '').toLowerCase().includes(query.subject.toLowerCase())) score += 3;
  const kws = Array.isArray(query.keywords)
    ? query.keywords
    : String(query.keywords || '').split(/\s+/).filter(Boolean);
  for (const k of kws) if (hay.includes(k.toLowerCase())) score += 1;
  if (query.topic && (email.text || '').toLowerCase().includes(query.topic.toLowerCase())) score += 2;
  return score;
}

// ────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────

export async function classifyEmails(emails, query = {}, { useLLM = true } = {}) {
  const out = [];
  for (const email of emails) {
    const axes = heuristicAxes(email);
    let semantic = null;
    if (useLLM && model) {
      semantic = await semanticClassify(email);
    }
    if (!semantic) {
      semantic = {
        ...ruleTopic(email, axes),
        urgency: axes.is_urgent ? 'alta' : 'baja',
        sentiment: 'neutro',
        language: /[ñáéíóú]/i.test(email.text || '') ? 'es' : 'en',
        entities: {
          people: [],
          organizations: [],
          dates: [],
          money: axes.amounts_aud.map((a) => `A$${a}`),
        },
        summary: (email.snippet || (email.text || '').slice(0, 120)).replace(/\s+/g, ' ').trim(),
        suggested_folder: '',
        suggested_actions: axes.is_urgent ? ['responder'] : ['archivar'],
        confidence: 0.5,
      };
    }
    semantic.suggested_folder = semantic.suggested_folder || semantic.topic;

    out.push({
      uid: email.uid,
      from: email.from,
      subject: email.subject,
      date: email.date,
      snippet: email.snippet,
      attachments_meta: (email.attachments || []).map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
      })),
      axes,
      semantic,
      match_score: matchScore(email, query),
    });
  }
  // Mejor match arriba, luego más reciente.
  out.sort((a, b) => {
    if (b.match_score !== a.match_score) return b.match_score - a.match_score;
    return new Date(b.date) - new Date(a.date);
  });
  return out;
}
