// ── Models ────────────────────────────────────────────────────────────────────
const HAIKU  = 'claude-haiku-4-5-20251001'
const SONNET = 'claude-sonnet-4-6'

const OT_GLOSSARY = `Documentary credits = Баримтат аккредитив
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
CS Adviser = Арилжааны үйлчилгээний зөвлөх`

const buildSystem = (tgtLang, userGlossary, tone, context, refAnalysis) => [
  `You are an expert translator specialising in corporate, legal, and technical documents.`,
  `TARGET LANGUAGE: ${tgtLang}`,
  `TONE: ${tone}`,
  `MANDATORY GLOSSARY:\n${OT_GLOSSARY}`,
  userGlossary ? `ADDITIONAL GLOSSARY:\n${userGlossary}` : '',
  refAnalysis ? `REFERENCE DOCUMENT GUIDANCE:\nType: ${refAnalysis.docType} | Domain: ${refAnalysis.domain}\nStyle: ${refAnalysis.style}\nKey terms:\n${(refAnalysis.keyTerms||[]).map(t=>`  ${t.source} = ${t.target}${t.note?` (${t.note})`:''}`).join('\n')}\nConventions: ${(refAnalysis.conventions||[]).join('; ')}` : '',
  context ? `DOCUMENT CONTEXT:\n${context}` : '',
  `RULES:
1. Return ONLY a valid JSON array. No markdown. No explanation.
2. Preserve as-is: reference numbers, codes, URLs, numbers, dates.
3. Rio Tinto stays English. Oyu Tolgoi = Оюу Толгой.
4. Wrap uncertain words in {{double braces}} for human review.
5. Return EXACTLY the same number of items as the input.
6. Empty strings stay empty strings.`
].filter(Boolean).join('\n\n')

function safeParseArray(raw) {
  const clean = raw.trim().replace(/^```json?\s*/i,'').replace(/\s*```$/,'').trim()
  try {
    const p = JSON.parse(clean)
    if (Array.isArray(p)) return p
    const v = Object.values(p)
    if (v.length===1 && Array.isArray(v[0])) return v[0]
  } catch(_) {}
  const m = clean.match(/\[[\s\S]*\]/)
  if (m) { try { const p=JSON.parse(m[0]); if(Array.isArray(p)) return p } catch(_) {} }
  // Truncation recovery: extract all complete quoted strings
  const entries=[], rx=/"((?:[^"\\]|\\.)*)"/g; let mt
  while((mt=rx.exec(clean))!==null) entries.push(mt[1].replace(/\\n/g,'\n').replace(/\\"/g,'"').replace(/\\\\/g,'\\'))
  if (entries.length>0) { console.warn(`Truncation recovery: ${entries.length} entries`); return entries }
  throw new Error('Could not parse API response. Document may be too large — try splitting it.\n\nFirst 200 chars: '+clean.slice(0,200))
}

async function callApi(texts, apiKey, model, system) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model, max_tokens:8192, system,
      messages:[{ role:'user', content:'Translate each string. Return a JSON array in the SAME ORDER and COUNT. JSON only, no markdown.\n\n'+JSON.stringify(texts) }] })
  })
  if (!res.ok) {
    const err = await res.json().catch(()=>({}))
    const msg = err.error?.message||`API error ${res.status}`
    if (res.status===401) throw new Error('Invalid API key.')
    if (res.status===429) throw new Error('Rate limit. Wait a moment and retry.')
    throw new Error(msg)
  }
  const data = await res.json()
  return safeParseArray(data.content[0].text)
}

function chunk(arr,size){ const o=[]; for(let i=0;i<arr.length;i+=size) o.push(arr.slice(i,i+size)); return o }

export async function pass1(texts,apiKey,tgtLang,glossary,context,tone,refAnalysis,onProg) {
  const sys=buildSystem(tgtLang,glossary,tone,context,refAnalysis)
  const chunks=chunk(texts,15); const out=[]
  for(let i=0;i<chunks.length;i++){ out.push(...await callApi(chunks[i],apiKey,HAIKU,sys)); onProg?.((i+1)/chunks.length) }
  return out
}

export async function pass2(originals,drafts,apiKey,tgtLang,glossary,context,tone,refAnalysis,onProg) {
  const sys=buildSystem(tgtLang,glossary,tone,context,refAnalysis)+'\n\nPASS 2: Fix terminology & consistency. Return corrected JSON array only.'
  const pairs=originals.map((o,i)=>`[ORIGINAL] ${o}\n[DRAFT] ${drafts[i]||''}`)
  const chunks=chunk(pairs,15); const out=[]
  for(let i=0;i<chunks.length;i++){ out.push(...await callApi(chunks[i],apiKey,HAIKU,sys)); onProg?.((i+1)/chunks.length) }
  return out
}

export async function pass3(p2,apiKey,tgtLang,glossary,context,tone,refAnalysis,onProg) {
  const sys=buildSystem(tgtLang,glossary,tone,context,refAnalysis)+'\n\nPASS 3: Final proofread. Wrap uncertain words in {{double braces}}. Return JSON array only.'
  const chunks=chunk(p2,15); const out=[]
  for(let i=0;i<chunks.length;i++){ out.push(...await callApi(chunks[i],apiKey,SONNET,sys)); onProg?.((i+1)/chunks.length) }
  return out
}

export async function analyzeReference(refText,apiKey,srcLang,tgtLang) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model:HAIKU, max_tokens:2048,
      system:'You are a translation analyst. Extract terminology and style guidance from reference documents. Return only valid JSON.',
      messages:[{ role:'user', content:`Analyze this reference document (translated from ${srcLang} to ${tgtLang}). Return this JSON only:
{"docType":"string","domain":"string","style":"describe register and formality","keyTerms":[{"source":"english","target":"translation","note":"optional"}],"conventions":["convention 1"],"summary":"2-3 sentences on what this teaches"}

Document (first 6000 chars):
${refText.slice(0,6000)}` }] })
  })
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`API error ${res.status}`) }
  const data = await res.json()
  const raw = data.content[0].text.trim().replace(/^```json?\s*/i,'').replace(/\s*```$/,'').trim()
  try { return JSON.parse(raw) } catch(_) {
    return { docType:'Document', domain:'General', style:'Formal', keyTerms:[], conventions:[], summary: raw.slice(0,400) }
  }
}

export function parseFlags(text) {
  const flags=[],seen=new Set()
  for(const m of [...(text||'').matchAll(/\{\{([^}]+)\}\}/g)]) {
    if(!seen.has(m[1])){ seen.add(m[1]); flags.push({ word:m[1], options:[{text:m[1],note:'Keep current (AI suggestion)',confidence:80}] }) }
  }
  return flags
}

export function stripFlags(text) { return (text||'').replace(/\{\{([^}]+)\}\}/g,'$1') }
