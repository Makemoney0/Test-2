require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const Twilio = require('twilio');
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const port = process.env.PORT || 3000;
const twClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ? Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;
const dbPath = process.env.DB_PATH || path.join(__dirname,'data','voice_agent.db');
const db = new Database(dbPath);

// Initialize DB
db.exec(`
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  date TEXT,
  time TEXT,
  party_size INTEGER,
  notes TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  items TEXT,
  pickup_time TEXT,
  total REAL,
  created_at TEXT
);
`);

// Simple helper to call LLM (OpenAI-compatible)
async function callLLM(messages, max_tokens=800) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set in environment');
  const payload = {
    model: "gpt-5-thinking-mini",
    messages,
    temperature: 0.1,
    max_tokens
  };
  const res = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  return res.data.choices[0].message.content;
}

const systemNLU = `Du bist ein professioneller, deutschsprachiger Voice-Assistant für Restaurants. ` +
  `Extrahiere aus der Benutzereingabe ein JSON-Objekt mit Feldern: intent, slots (object), confidence (0-1). ` +
  `Mögliche intents: reserve_table, order_takeaway, ask_menu, ask_hours_location, change_cancel, feedback, fallback.`;

async function parseUserText(text) {
  const userMsg = [{ role: "system", content: systemNLU }, { role: "user", content: text }];
  try {
    const resp = await callLLM(userMsg, 400);
    // Expecting JSON
    let parsed = null;
    try { parsed = JSON.parse(resp); }
    catch (e) {
      // If not JSON, try to extract JSON substring
      const m = resp.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    if (!parsed) return { intent: "fallback", slots: {}, confidence: 0 };
    return parsed;
  } catch (err) {
    console.error('LLM parse error', err.message);
    return { intent: "fallback", slots: {}, confidence: 0 };
  }
}

// Basic LLM response generator for dialog replies
const systemAssistant = `Du bist ein höflicher, knapp formulierter deutschsprachiger Telefon- und Voice-Assistent für ein Restaurant. ` +
  `Fasse dich kurz, bestätige kritische Felder (Datum, Uhrzeit, Personen, Name) und frage nur wenn nötig. ` +
  `Antworte freundlich und professionell.`;

async function generateReply(context) {
  const msgs = [{ role: "system", content: systemAssistant }, { role: "user", content: context }];
  try {
    const reply = await callLLM(msgs, 300);
    return reply;
  } catch (err) {
    console.error('LLM reply error', err.message);
    return 'Entschuldigung, gerade ist ein Fehler aufgetreten. Ich verbinde Sie mit unserem Personal.';
  }
}

// Simple web endpoints for Twilio
app.post('/voice', async (req, res) => {
  // Twilio may send SpeechResult (if using <Gather> with speech) or RecordingUrl, or empty for first contact
  const twiml = new Twilio.twiml.VoiceResponse();
  const speech = (req.body.SpeechResult || '').trim();
  const callSid = req.body.CallSid || uuidv4();

  // First contact: ask how to help
  if (!speech) {
    twiml.say({ voice: 'woman', language: 'de-DE' }, 'Guten Tag. Willkommen beim Restaurant. Wie kann ich Ihnen helfen?');
    twiml.record({ playBeep: false, timeout: 4, maxLength: 20, transcribe: true, transcribeCallback: '/transcribe' });
    res.type('text/xml').send(twiml.toString());
    return;
  }

  // Parse user speech
  const parsed = await parseUserText(speech);
  console.log('Parsed intent', parsed.intent, 'slots', parsed.slots);

  try {
    if (parsed.intent === 'reserve_table') {
      const s = parsed.slots || {};
      const id = uuidv4();
      const created_at = new Date().toISOString();
      const stmt = db.prepare(`INSERT INTO reservations (id,name,phone,date,time,party_size,notes,created_at) VALUES (?,?,?,?,?,?,?,?)`);
      stmt.run(id, s.name || 'Gast', s.phone || '', s.date || '', s.time || '', s.party_size || 1, s.notes || '', created_at);

      const reply = `Danke. Ich habe Ihre Reservierung für den ${s.date || 'angegebenen Tag'} um ${s.time || 'angegebene Zeit'} für ${s.party_size || 1} Personen auf den Namen ${s.name || 'Gast'} eingetragen. Möchten Sie eine Bestätigung per SMS?`;
      twiml.say({ voice: 'woman', language: 'de-DE' }, reply);
      twiml.record({ playBeep: false, timeout: 3, maxLength: 3, transcribe: true, transcribeCallback: '/transcribe-sms' });
      res.type('text/xml').send(twiml.toString());
      return;
    } else if (parsed.intent === 'ask_hours_location') {
      const reply = 'Wir sind täglich von 11:30 bis 22:00 Uhr geöffnet. Wir befinden uns in der Musterstraße 12, 10115 Berlin.';
      twiml.say({ voice: 'woman', language: 'de-DE' }, reply);
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());
      return;
    } else if (parsed.intent === 'order_takeaway') {
      const s = parsed.slots || {};
      const id = uuidv4();
      const created_at = new Date().toISOString();
      db.prepare(`INSERT INTO orders (id,name,phone,items,pickup_time,total,created_at) VALUES (?,?,?,?,?,?,?)`)
        .run(id, s.name || 'Gast', s.phone || '', JSON.stringify(s.items || []), s.pickup_time || '', s.total || 0.0, created_at);
      const reply = `Danke. Ihre Bestellung wurde aufgenommen. Abholung in ${s.pickup_time || 'kurzer Zeit'}. Ihre Bestellnummer ist ${id.slice(0,8)}.`;
      twiml.say({ voice: 'woman', language: 'de-DE' }, reply);
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());
      return;
    } else {
      // fallback: generate polite reply and offer to connect to staff
      const text = await generateReply(speech);
      twiml.say({ voice: 'woman', language: 'de-DE' }, text);
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());
      return;
    }
  } catch (err) {
    console.error('Processing error', err);
    twiml.say({ voice: 'woman', language: 'de-DE' }, 'Entschuldigung, es ist ein Fehler aufgetreten. Ich verbinde Sie mit einem Mitarbeiter.');
    if (process.env.AGENT_PHONE) twiml.dial(process.env.AGENT_PHONE);
    else twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

app.post('/transcribe', (req, res) => {
  // Twilio transcribe callback (optional)
  console.log('transcribe callback', req.body);
  res.status(200).send('');
});

app.post('/transcribe-sms', async (req, res) => {
  console.log('/transcribe-sms', req.body);
  // Simplified: in production map callSid->reservation phone and send SMS
  res.status(200).send('');
});

app.get('/admin/reservations', (req, res) => {
  const rows = db.prepare('SELECT * FROM reservations ORDER BY created_at DESC LIMIT 200').all();
  res.json(rows);
});

app.listen(port, () => console.log(`Voice Agent listening at http://localhost:${port}`));