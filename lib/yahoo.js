// Yahoo Mail IMAP client.
// Devuelve mensajes parseados listos para clasificar.
// Si faltan credenciales, expone un set de emails mock para que el flujo se pueda demostrar.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const MOCK_EMAILS = [
  {
    uid: 'mock-1',
    from: { name: 'Origin Energy', address: 'noreply@originenergy.com.au' },
    to: 'me@yahoo.com.au',
    subject: 'Your electricity bill — March 2026',
    date: new Date('2026-04-02T08:14:00Z'),
    snippet: 'Your bill of A$184.50 is due 23 April. ABN 16 087 011 968. GST included.',
    text: 'Hi, your electricity invoice for 12 Hilltop Rd is now available. Amount due: A$184.50. Due date: 23 April 2026. ABN: 16 087 011 968. GST included A$16.77. View bill online or pay via BPAY.',
    html: '',
    attachments: [],
    raw: 'From: Origin Energy <noreply@originenergy.com.au>\r\nSubject: Your electricity bill — March 2026\r\n\r\nAmount due: A$184.50',
  },
  {
    uid: 'mock-2',
    from: { name: 'Qantas', address: 'reservations@qantas.com' },
    to: 'me@yahoo.com.au',
    subject: 'Booking confirmation SYD → BCN (QF1)',
    date: new Date('2026-05-10T13:02:00Z'),
    snippet: 'Your flight is confirmed. Departing Sydney 14 June, arriving Barcelona 15 June.',
    text: 'Booking reference: 7K3X9P. Flight QF1 Sydney → London → Barcelona. Departs 14 June 22:00 AEST. Total: A$2,490 incl GST.',
    html: '',
    attachments: [{ filename: 'eticket-7K3X9P.pdf', contentType: 'application/pdf', size: 84210 }],
    raw: 'From: Qantas <reservations@qantas.com>\r\nSubject: Booking confirmation SYD → BCN (QF1)\r\n\r\nBooking ref 7K3X9P',
  },
  {
    uid: 'mock-3',
    from: { name: 'Maria Lopez', address: 'maria.lopez@gmail.com' },
    to: 'me@yahoo.com.au',
    subject: 'Cumpleaños de Lucas — sábado',
    date: new Date('2026-05-18T19:30:00Z'),
    snippet: '¿Venís el sábado a las 17? Trae lo que quieras, hay parrilla.',
    text: 'Hola! Te confirmo que el cumple es el sábado a las 17h en casa. Avisame si traés a alguien. Besos, Maria.',
    html: '',
    attachments: [],
    raw: 'From: Maria Lopez <maria.lopez@gmail.com>\r\nSubject: Cumpleaños de Lucas\r\n\r\nHola!',
  },
  {
    uid: 'mock-4',
    from: { name: 'LinkedIn', address: 'jobs-noreply@linkedin.com' },
    to: 'me@yahoo.com.au',
    subject: '5 new senior engineer roles for you',
    date: new Date('2026-05-20T07:00:00Z'),
    snippet: 'Atlassian, Canva, Culture Amp and 2 more are hiring.',
    text: 'See your new job matches. Atlassian — Staff Engineer (Sydney). Canva — Principal SWE (Sydney, hybrid).',
    html: '',
    attachments: [],
    raw: 'From: LinkedIn <jobs-noreply@linkedin.com>\r\nSubject: 5 new senior engineer roles\r\n\r\nList-Unsubscribe: <https://linkedin.com/unsub>',
  },
  {
    uid: 'mock-5',
    from: { name: 'ATO', address: 'do-not-reply@ato.gov.au' },
    to: 'me@yahoo.com.au',
    subject: 'Your 2025 tax return is ready for review',
    date: new Date('2026-05-22T03:00:00Z'),
    snippet: 'Estimated refund: A$1,210. Sign in to myGov to confirm.',
    text: 'Hello, your tax return for the 2024–2025 financial year is ready. Estimated refund A$1,210. ABN-related deductions have been pre-filled.',
    html: '',
    attachments: [],
    raw: 'From: ATO <do-not-reply@ato.gov.au>\r\nSubject: Your 2025 tax return is ready\r\n\r\n',
  },
];

export function hasYahooCredentials() {
  return Boolean(process.env.YAHOO_EMAIL && process.env.YAHOO_APP_PASSWORD);
}

// Conexión rápida: login + logout. Sirve para validar credenciales desde la UI.
export async function testYahooLogin() {
  if (!hasYahooCredentials()) {
    return { ok: false, reason: 'No hay credenciales configuradas.' };
  }
  const client = new ImapFlow({
    host: process.env.YAHOO_IMAP_HOST || 'imap.mail.yahoo.com',
    port: Number(process.env.YAHOO_IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.YAHOO_EMAIL, pass: process.env.YAHOO_APP_PASSWORD },
    logger: false,
  });
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen('INBOX');
    await client.logout();
    return { ok: true, account: process.env.YAHOO_EMAIL, total: mailbox.exists };
  } catch (e) {
    try { await client.logout(); } catch (_) { /* ignore */ }
    return { ok: false, reason: e.message };
  }
}

function buildIMAPSearch(query) {
  // query = { from, subject, keywords[], sinceDays, mailbox }
  // ImapFlow search criteria: https://imapflow.com/module-imapflow-ImapFlow.html#search
  const criteria = {};
  if (query.from) criteria.from = query.from;
  if (query.subject) criteria.subject = query.subject;
  if (query.sinceDays) {
    const since = new Date();
    since.setDate(since.getDate() - Number(query.sinceDays));
    criteria.since = since;
  }
  // Keywords: ImapFlow accepts `body` for fulltext. Multiple keywords → AND via array of objects.
  if (Array.isArray(query.keywords) && query.keywords.length) {
    criteria.body = query.keywords.join(' ');
  } else if (typeof query.keywords === 'string' && query.keywords.trim()) {
    criteria.body = query.keywords.trim();
  }
  // If nothing was given, fall back to "last N days".
  if (Object.keys(criteria).length === 0) {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    criteria.since = since;
  }
  return criteria;
}

async function fetchMockMatches(query) {
  const q = (s) => (s || '').toLowerCase();
  const wantedFrom = q(query.from);
  const wantedSubject = q(query.subject);
  const keywords = Array.isArray(query.keywords)
    ? query.keywords.map(q)
    : q(query.keywords).split(/\s+/).filter(Boolean);

  return MOCK_EMAILS.filter((m) => {
    const hay = `${m.from.name} ${m.from.address} ${m.subject} ${m.text}`.toLowerCase();
    if (wantedFrom && !hay.includes(wantedFrom)) return false;
    if (wantedSubject && !q(m.subject).includes(wantedSubject)) return false;
    if (keywords.length && !keywords.every((k) => hay.includes(k))) return false;
    return true;
  });
}

export async function fetchYahooByUids(uids, { mailbox = 'INBOX' } = {}) {
  if (!hasYahooCredentials()) return { mock: true, messages: [] };
  if (!uids || !uids.length) return { mock: false, messages: [] };

  const client = new ImapFlow({
    host: process.env.YAHOO_IMAP_HOST || 'imap.mail.yahoo.com',
    port: Number(process.env.YAHOO_IMAP_PORT || 993),
    secure: true,
    auth: {
      user: process.env.YAHOO_EMAIL,
      pass: process.env.YAHOO_APP_PASSWORD,
    },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock(mailbox);
  const messages = [];

  try {
    for (const uid of uids) {
      try {
        const msg = await client.fetchOne(
          String(uid),
          { uid: true, envelope: true, source: true, internalDate: true, flags: true },
          { uid: true }
        );
        if (!msg) continue;
        const parsed = await simpleParser(msg.source);
        messages.push({
          uid: String(msg.uid),
          from: {
            name: parsed.from?.value?.[0]?.name || '',
            address: parsed.from?.value?.[0]?.address || '',
          },
          to: parsed.to?.text || '',
          subject: parsed.subject || '',
          date: parsed.date || msg.internalDate,
          snippet: (parsed.text || '').slice(0, 280).replace(/\s+/g, ' ').trim(),
          text: parsed.text || '',
          html: parsed.html || '',
          attachments: (parsed.attachments || []).map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
            content: a.content,
          })),
          raw: msg.source.toString('utf8'),
        });
      } catch (e) {
        console.error(`fetchYahooByUids: uid=${uid} failed:`, e.message);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return { mock: false, messages };
}

export async function searchYahoo(query, { limit = 50 } = {}) {
  if (!hasYahooCredentials()) {
    const mocks = await fetchMockMatches(query);
    return { mock: true, messages: mocks.slice(0, limit) };
  }

  const client = new ImapFlow({
    host: process.env.YAHOO_IMAP_HOST || 'imap.mail.yahoo.com',
    port: Number(process.env.YAHOO_IMAP_PORT || 993),
    secure: true,
    auth: {
      user: process.env.YAHOO_EMAIL,
      pass: process.env.YAHOO_APP_PASSWORD,
    },
    logger: false,
  });

  await client.connect();
  const mailbox = query.mailbox || 'INBOX';
  const lock = await client.getMailboxLock(mailbox);
  const messages = [];

  try {
    const criteria = buildIMAPSearch(query);
    const uids = (await client.search(criteria, { uid: true })) || [];
    // Más recientes primero, capeamos al limit.
    const slice = uids.slice(-limit).reverse();

    for (const uid of slice) {
      const msg = await client.fetchOne(
        uid,
        { uid: true, envelope: true, source: true, internalDate: true, flags: true },
        { uid: true }
      );
      if (!msg) continue;
      const parsed = await simpleParser(msg.source);
      messages.push({
        uid: String(msg.uid),
        from: {
          name: parsed.from?.value?.[0]?.name || '',
          address: parsed.from?.value?.[0]?.address || '',
        },
        to: parsed.to?.text || '',
        subject: parsed.subject || '',
        date: parsed.date || msg.internalDate,
        snippet: (parsed.text || '').slice(0, 280).replace(/\s+/g, ' ').trim(),
        text: parsed.text || '',
        html: parsed.html || '',
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
          content: a.content, // Buffer
        })),
        raw: msg.source.toString('utf8'),
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return { mock: false, messages };
}
