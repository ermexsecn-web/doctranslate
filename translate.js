// ── Models ────────────────────────────────────────────────────────────────────
const HAIKU  = 'claude-haiku-4-5-20251001'   // Pass 1 & 2 — cheap, fast
const SONNET = 'claude-sonnet-4-6'           // Pass 3 — quality proofread

// ── OT Standard Glossary (always applied) ────────────────────────────────────
const OT_GLOSSARY = `
Documentary credits = Баримтат аккредитив
Bill of exchange = Вексель
Bank Form including Electronic Banking Service = Цахим банкны үйлчилгээний маягт гэх мэт банкны маягт
WHR receipts = Агуулахын баримт
Certificate of Origin = Гарал үүслийн гэрчилгээ
Certificate of Weight and Analysis = Жин болон шинжилгээний гэрчилгээ
Group A = А групп
Group B = Б групп
Authorized Signatories = Гарын үсэг зурах эрх бүхий албан тушаалтнууд
Chief Executive Officer = Гүйцэтгэх захирал
Resolution of CEO = Гүйцэтгэх захирлын тушаал
Oyu Tolgoi LLC = Оюу Толгой ХХК
Name/Position = Нэр/Албан тушаал
Specimen Signature = Гарын үсгийн загвар
General Manager Commercial Services = Арилжааны үйлчилгээний Ерөнхий менежер
Manager Delivery = Нийлүүлэлт хариуцсан менежер
Advisor Invoicing = Нэхэмжлэх хариуцсан зөвлөх
Advisor Third Party Origination = Гуравдагч талын эх үүсвэр хариуцсан зөвлөх
CS Senior Adviser = Арилжааны үйлчилгээний Ахлах зөвлөх
CS Adviser = Арилжааны үйлчилгээний зөвлөх
`.trim()

const buildSystem = (targetLang, userGlossary, tone, context) => `
You are an expert translator specialising in corporate, legal, and technical documents for Mongolian companies.

TARGET LANGUAGE: ${targetLang}
TONE: ${tone}

MANDATORY GLOSSARY — use these exact translations every time:
${OT_GLOSSARY}
${userGlossary ? `\nADDITIONAL GLOSSARY (user-supplied):\n${userGlossary}` : ''}

${context ? `DOCUMENT CONTEXT:\n${context}\n` : ''}

RULES:
1. Return ONLY valid JSON — no markdown fences, no explanation, no extra text.
2. Preserve as-is: reference numbers (A/87, A/15), company codes, URLs, email addresses, numbers, dates.
3. "Rio Tinto" stays as "Rio Tinto". "Oyu Tolgoi" → "Оюу Толгой".
4. Wrap genuinely ambiguous or uncertain words in {{double braces}} so the reviewer can check them.
5. Maintain formal register for legal/official documents.
6. Empty strings translate to empty strings.
`.trim()

// ── Core API call ─────────────────────────────────────────────────────────────
async function callApi(texts, apiKey, model, system) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: [{
        role: 'user',
        content:
          'Translate each item in this JSON array. Return a JSON array of translated strings in the same order.\n\n' +
          JSON.stringify(texts),
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `API error ${res.status}`)
  }

  const data = await res.json()
  const raw = data.content[0].text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(raw)
}

// ── Chunker ───────────────────────────────────────────────────────────────────
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Pass 1 — initial translation (Haiku) ─────────────────────────────────────
export async function pass1(texts, apiKey, targetLang, userGlossary, context, tone, onProg) {
  const sys = buildSystem(targetLang, userGlossary, tone, context)
  const chunks = chunk(texts, 40)
  const out = []
  for (let i = 0; i < chunks.length; i++) {
    out.push(...await callApi(chunks[i], apiKey, HAIKU, sys))
    onProg?.((i + 1) / chunks.length)
  }
  return out
}

// ── Pass 2 — consistency check (Haiku) ───────────────────────────────────────
export async function pass2(originals, drafts, apiKey, targetLang, userGlossary, context, tone, onProg) {
  const sys = buildSystem(targetLang, userGlossary, tone, context) +
    '\n\nPASS 2: Review and correct the draft translations for terminology consistency and glossary compliance. Return the corrected translations as a JSON array.'

  const pairs = originals.map((o, i) => `[ORIGINAL] ${o}\n[DRAFT] ${drafts[i]}`)
  const chunks = chunk(pairs, 40)
  const out = []
  for (let i = 0; i < chunks.length; i++) {
    out.push(...await callApi(chunks[i], apiKey, HAIKU, sys))
    onProg?.((i + 1) / chunks.length)
  }
  return out
}

// ── Pass 3 — proofread + flag (Sonnet) ───────────────────────────────────────
export async function pass3(p2results, apiKey, targetLang, userGlossary, context, tone, onProg) {
  const sys = buildSystem(targetLang, userGlossary, tone, context) +
    '\n\nPASS 3: Final proofread. Fix any remaining issues. Wrap genuinely uncertain words in {{double braces}} for human review. Return the final translations as a JSON array.'

  const chunks = chunk(p2results, 40)
  const out = []
  for (let i = 0; i < chunks.length; i++) {
    out.push(...await callApi(chunks[i], apiKey, SONNET, sys))
    onProg?.((i + 1) / chunks.length)
  }
  return out
}

// ── Parse {{flagged}} words from pass3 output ─────────────────────────────────
export function parseFlags(text) {
  const flags = []
  const matches = [...text.matchAll(/\{\{([^}]+)\}\}/g)]
  for (const m of matches) {
    flags.push({
      word: m[1],
      options: [
        { text: m[1],       note: 'Keep current (AI suggestion)',  confidence: 80, ref: false },
        { text: '',         note: 'Type your own below',            confidence: 0,  ref: false },
      ],
    })
  }
  return flags
}

export function stripFlags(text) {
  return text.replace(/\{\{([^}]+)\}\}/g, '$1')
}
