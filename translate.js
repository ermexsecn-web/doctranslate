const HAIKU  = 'claude-haiku-4-5-20251001'
const SONNET = 'claude-sonnet-4-6'

const OT_GLOSSARY = `Documentary credits = Баримтат аккредитив
Bill of exchange = Вексель
Bank Form including Electronic Banking Service = Цахим банкны үйлчилгээний маягт гэх мэт банкны маягт
WHR receipts = Агуулахын баримт
Certificate of Origin = Гарал үүслийн гэрчилгээ
Certificate of Weight and Analysis = Жин болон шинжилгээний гэрчилгээ
Group A = А групп / Group B = Б групп
Authorized Signatories = Гарын үсэг зурах эрх бүхий албан тушаалтнууд
Chief Executive Officer = Гүйцэтгэх захирал / Resolution of CEO = Гүйцэтгэх захирлын тушаал
Oyu Tolgoi LLC = Оюу Толгой ХХК
Name/Position = Нэр/Албан тушаал / Specimen Signature = Гарын үсгийн загвар
General Manager Commercial Services = Арилжааны үйлчилгээний Ерөнхий менежер
Manager Delivery = Нийлүүлэлт хариуцсан менежер
Advisor Invoicing = Нэхэмжлэх хариуцсан зөвлөх
Advisor Third Party Origination = Гуравдагч талын эх үүсвэр хариуцсан зөвлөх
CS Senior Adviser = Арилжааны үйлчилгээний Ахлах зөвлөх
CS Adviser = Арилжааны үйлчилгээний зөвлөх`

const buildSystem = (tgtLang, userGlossary, dbGlossary, tone, context, refAnalyses, partialSpec, customInstructions) => {
  const dbLines = (dbGlossary||[]).slice(0,120).map(t=>`${t.src} = ${t.tgt} [${t.confidence}%]`).join('\n')
  return [
    `You are an expert translator for corporate, legal, and technical documents.`,
    `TARGET LANGUAGE: ${tgtLang} | TONE: ${tone}`,
    `MANDATORY OT GLOSSARY (always apply):\n${OT_GLOSSARY}`,
    userGlossary ? `USER GLOSSARY:\n${userGlossary}` : '',
    dbLines ? `LEARNED GLOSSARY DATABASE:\n${dbLines}` : '',
    ...(refAnalyses||[]).filter(a=>a&&a.docType).map((r,i)=>
      `REFERENCE ${i+1} (${r.docType}):\nStyle: ${r.style}\nTerms:\n${(r.keyTerms||[]).map(t=>`  ${t.source} = ${t.target}`).join('\n')}\nConventions: ${(r.conventions||[]).join('; ')}`
    ),
    context ? `DOCUMENT CONTEXT:\n${context}` : '',
    partialSpec ? `PARTIAL TRANSLATION: Only translate content matching: "${partialSpec}". Return original text unchanged for everything else.` : '',
    customInstructions ? `CUSTOM INSTRUCTIONS:\n${customInstructions}` : '',
    `RULES:
1. Return ONLY a valid JSON array of strings. No markdown. No explanation. No nesting.
2. Each element MUST be a plain string — never an array or object.
3. Preserve as-is: reference numbers, codes, URLs, numbers, dates.
4. Rio Tinto stays English. Oyu Tolgoi = Оюу Толгой.
5. Wrap uncertain words in {{double braces}} for human review.
6. Return EXACTLY the same number of items as the input.`,
  ].filter(Boolean).join('\n\n')
}

// ── Guaranteed string array output ────────────────────────────────────────────
function toStrArr(arr) {
  return arr.map(item => {
    if (typeof item === 'string') return item
    if (item === null || item === undefined) return ''
    if (Array.isArray(item)) return item.join(' ')
    return String(item)
  })
}

function safeParseArray(raw) {
  const c = raw.trim().replace(/^```json?\s*/i,'').replace(/\s*```$/,'').trim()
  try {
    const p = JSON.parse(c)
    if (Array.isArray(p)) return toStrArr(p)
    const v = Object.values(p)
    if (v.length === 1 && Array.isArray(v[0])) return toStrArr(v[0])
  } catch(_) {}
  const m = c.match(/\[[\s\S]*\]/)
  if (m) { try { const p=JSON.parse(m[0]); if(Array.isArray(p)) return toStrArr(p) } catch(_) {} }
  // Truncation recovery: extract all complete quoted strings
  const entries = [], rx = /"((?:[^"\\]|\\.)*)"/g; let mt
  while ((mt = rx.exec(c)) !== null)
    entries.push(mt[1].replace(/\\n/g,'\n').replace(/\\"/g,'"').replace(/\\\\/g,'\\'))
  if (entries.length > 0) { console.warn(`Truncation recovery: ${entries.length} items`); return entries }
  throw new Error('Could not parse API response. Try a smaller document.\n' + c.slice(0,200))
}

async function callApi(texts, apiKey, model, system) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model, max_tokens:8192, system, messages:[{ role:'user', content:'Translate each string. Return a JSON array of plain strings only, same order and count:\n'+JSON.stringify(texts) }] })
  })
  if (!r.ok) {
    const e = await r.json().catch(()=>({}))
    const msg = e.error?.message || `API ${r.status}`
    if (r.status === 401) throw new Error('Invalid API key.')
    if (r.status === 429) throw new Error('Rate limit hit. Wait a moment.')
    throw new Error(msg)
  }
  return safeParseArray((await r.json()).content[0].text)
}

function chunk(arr, n) { const o=[]; for(let i=0;i<arr.length;i+=n) o.push(arr.slice(i,i+n)); return o }

export async function pass1(texts,apiKey,tgtLang,glossary,dbGlossary,ctx,tone,refs,partial,custom,onP) {
  const sys = buildSystem(tgtLang,glossary,dbGlossary,tone,ctx,refs,partial,custom)
  const chunks=chunk(texts,15), out=[]
  for(let i=0;i<chunks.length;i++) { out.push(...await callApi(chunks[i],apiKey,HAIKU,sys)); onP?.((i+1)/chunks.length) }
  return out
}
export async function pass2(orig,drafts,apiKey,tgtLang,glossary,dbGlossary,ctx,tone,refs,partial,custom,onP) {
  const sys = buildSystem(tgtLang,glossary,dbGlossary,tone,ctx,refs,partial,custom)+'\n\nPASS 2: Fix terminology & consistency. JSON array of plain strings only.'
  const pairs = orig.map((o,i)=>`[ORIG] ${o}\n[DRAFT] ${drafts[i]||''}`)
  const chunks=chunk(pairs,15), out=[]
  for(let i=0;i<chunks.length;i++) { out.push(...await callApi(chunks[i],apiKey,HAIKU,sys)); onP?.((i+1)/chunks.length) }
  return out
}
export async function pass3(p2,apiKey,tgtLang,glossary,dbGlossary,ctx,tone,refs,partial,custom,onP) {
  const sys = buildSystem(tgtLang,glossary,dbGlossary,tone,ctx,refs,partial,custom)+'\n\nPASS 3: Final proofread. Wrap uncertain words in {{double braces}}. JSON array of plain strings only.'
  const chunks=chunk(p2,15), out=[]
  for(let i=0;i<chunks.length;i++) { out.push(...await callApi(chunks[i],apiKey,SONNET,sys)); onP?.((i+1)/chunks.length) }
  return out
}

export async function analyzeReference(refText, apiKey, srcLang, tgtLang) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({model:HAIKU,max_tokens:2048,
      system:'Translation analyst. Extract terminology from reference docs. Return valid JSON only.',
      messages:[{role:'user',content:`Analyze (${srcLang}→${tgtLang}). Return JSON only:
{"docType":"str","domain":"str","style":"str","keyTerms":[{"source":"str","target":"str","note":"str"}],"conventions":["str"],"summary":"str"}
Document:\n${refText.slice(0,6000)}`}]})
  })
  if (!r.ok) { const e=await r.json().catch(()=>({})); throw new Error(e.error?.message||`API ${r.status}`) }
  const raw = (await r.json()).content[0].text.trim().replace(/^```json?\s*/i,'').replace(/\s*```$/,'').trim()
  try { return JSON.parse(raw) }
  catch { return { docType:'Document',domain:'General',style:'Formal',keyTerms:[],conventions:[],summary:raw.slice(0,300) } }
}

// ── parseFlags and stripFlags — always coerce to string first ─────────────────
export function parseFlags(text) {
  // Guarantee string — API occasionally returns non-string array elements
  const str = typeof text === 'string' ? text : String(text ?? '')
  const flags = [], seen = new Set()
  for (const m of str.matchAll(/\{\{([^}]+)\}\}/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      flags.push({ word:m[1], options:[{ text:m[1], note:'Keep current (AI suggestion)', confidence:80 }] })
    }
  }
  return flags
}

export function stripFlags(text) {
  return String(text ?? '').replace(/\{\{([^}]+)\}\}/g, '$1')
}
