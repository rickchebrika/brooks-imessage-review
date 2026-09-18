const ZAPIER_URL = 'https://hooks.zapier.com/hooks/catch/18827154/4dz14wo/';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function clean(value, max = 20000) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function splitName(name) {
  const parts = clean(name, 200).split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

function cleanContactName(rawName, email, transcript) {
  const MARKER = '2026-09-18-clean-contact-name-v1';
  void MARKER;

  const normalize = value => String(value == null ? '' : value)
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  const text = normalize(transcript);
  let fromTranscript = '';

  const q = /what name should our team ask for\?/i.exec(text);
  if (q) {
    const rest = text.slice(q.index + q[0].length);
    const end = /what(?:'|’)?s the best email address for us to reach you\?/i.exec(rest);
    fromTranscript = normalize(end ? rest.slice(0, end.index) : rest);
  }

  let name = normalize(fromTranscript || rawName);
  const emailValue = normalize(email).toLowerCase();

  if (emailValue && name.toLowerCase().startsWith(emailValue + ' ')) {
    name = normalize(name.slice(emailValue.length));
  }

  if (emailValue && name.toLowerCase() === emailValue) {
    name = '';
  }

  return name.slice(0, 200);
}

function between(text, start, end) {
  const m = text.match(start);
  if (!m) return '';
  const rest = text.slice((m.index || 0) + m[0].length);
  const e = end ? rest.match(end) : null;
  return clean(e ? rest.slice(0, e.index) : rest, 1500);
}

function parseAnswers(transcript, body) {
  const text = clean(transcript, 20000)
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');

  const direct = (keys) => {
    for (const key of keys) {
      if (body[key] != null && clean(body[key])) return clean(body[key], 1500);
    }
    return '';
  };

  return {
    accident_type:
      direct(['accident_type','accidentType','type_of_accident']) ||
      between(text, /what kind of accident was it\?/i, /where did the accident happen\?/i),

    accident_location:
      direct(['accident_location','accidentLocation','location']) ||
      between(text, /where did the accident happen\?\s*(?:a city and state is enough\.)?/i, /approximately when did it happen\?/i),

    accident_date:
      direct(['accident_date','accidentDate','accident_when','when']) ||
      between(text, /approximately when did it happen\?/i, /were you,\s*or the person you're asking for,\s*injured in the accident\?/i),

    injured:
      direct(['injured','was_injured','injury_status']) ||
      between(text, /were you,\s*or the person you're asking for,\s*injured in the accident\?/i, /has the injured person received any medical care since the accident\?/i),

    medical_care:
      direct(['medical_care','medicalCare','received_medical_care']) ||
      between(text, /has the injured person received any medical care since the accident\?/i, /who do you think may have caused the accident\?/i),

    fault:
      direct(['fault','accident_fault','who_caused_accident']) ||
      between(text, /who do you think may have caused the accident\?\s*(?:it's okay if you're unsure\.)?/i, /is an attorney already handling this accident\?/i),

    attorney_status:
      direct(['attorney_status','attorneyStatus','has_attorney']) ||
      between(text, /is an attorney already handling this accident\?/i, /thank you\.\s*let's check the details before we continue\.|what name should our team ask for\?/i)
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      transport: 'zapier',
      live_mode: true,
      synthetic_test_posts: false,
      webhook: 'configured',
      structured_answers: true
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid request body' });
  }

  const email = clean(body.email, 320).toLowerCase();
  const phone = clean(body.phone, 80);
  const preference = clean(body.preference, 80);
  const transcript = clean(body.transcript, 20000);
  const name = cleanContactName(clean(body.name, 200), email, transcript);
  const consent = body.consent === true;

  if (!name || !email || !phone || !preference || !consent) {
    return json(res, 400, {
      ok: false,
      error: 'Name, email, phone, contact preference and consent are required'
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { ok: false, error: 'Invalid email address' });
  }

  const person = splitName(name);
  const answers = parseAnswers(transcript, body);
  const utm = body.utm && typeof body.utm === 'object' ? body.utm : {};

  const payload = {
    event: 'brooks_intake_submission',
    source: 'Brooks iMessage Funnel',
    source_value: 'Meta Ads',
    submitted_at: new Date().toISOString(),

    accident_type: answers.accident_type,
    accident_location: answers.accident_location,
    accident_date: answers.accident_date,
    injured: answers.injured,
    medical_care: answers.medical_care,
    fault: answers.fault,
    attorney_status: answers.attorney_status,

    name,
    first_name: person.first_name,
    last_name: person.last_name,
    email,
    phone,
    preferred_contact: preference,
    preference,
    consent,

    conversation_transcript: transcript,
    utm,
    submission: body
  };

  try {
    const upstream = await fetch(ZAPIER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const raw = await upstream.text();

    if (!upstream.ok) {
      console.error('Zapier rejected LIVE Brooks submission', upstream.status, raw.slice(0, 1000));
      return json(res, 502, {
        ok: false,
        error: `Brooks submission webhook rejected the request (HTTP ${upstream.status})`,
        webhook_status: upstream.status
      });
    }

    let responseData = null;
    try { responseData = raw ? JSON.parse(raw) : null; } catch {}

    return json(res, 200, {
      ok: true,
      transport: 'zapier',
      live_submission: true,
      webhook_status: upstream.status,
      webhook_response: responseData,
      intake_id: null
    });
  } catch (error) {
    console.error('Zapier LIVE webhook request failed', error && error.message ? error.message : error);
    return json(res, 502, {
      ok: false,
      error: 'Could not reach Brooks submission webhook'
    });
  }
};
