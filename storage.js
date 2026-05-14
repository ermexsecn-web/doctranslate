// ── Keys ──────────────────────────────────────────────────────────────────────
const G_KEY = 'dt_glossary_v1'
const H_KEY = 'dt_history_v1'

// ── Glossary ──────────────────────────────────────────────────────────────────
export function loadGlossary() {
  try { return JSON.parse(localStorage.getItem(G_KEY) || '[]') } catch { return [] }
}

function saveGlossary(terms) {
  try { localStorage.setItem(G_KEY, JSON.stringify(terms)) } catch(e) {
    console.warn('Glossary save failed (storage full?):', e)
  }
}

// source: 'reference' | 'glossary-file' | 'learned' | 'manual'
// confidence by source: reference=75, glossary-file=85, learned=90, manual=95
const SOURCE_CONFIDENCE = { reference:75, 'glossary-file':85, learned:90, manual:95 }

export function mergeTerms(newTerms, source, srcLang, tgtLang) {
  const db   = loadGlossary()
  const now  = new Date().toISOString().slice(0,10)
  const base = SOURCE_CONFIDENCE[source] || 75

  for (const t of newTerms) {
    if (!t.source?.trim() || !t.target?.trim()) continue
    const key = t.source.toLowerCase().trim()
    const idx = db.findIndex(e => e.src.toLowerCase()===key && e.srcLang===srcLang && e.tgtLang===tgtLang)
    if (idx >= 0) {
      const e = db[idx]
      if (e.tgt === t.target) {
        // Same translation confirmed — boost confidence
        e.confidence = Math.min(99, e.confidence + 2)
        e.uses++
      } else if (base > e.confidence) {
        // Higher-confidence source disagrees — update
        e.tgt = t.target; e.confidence = base; e.source = source
      }
      e.lastSeen = now
    } else {
      db.push({ id:Math.random().toString(36).slice(2,10), src:t.source.trim(), tgt:t.target.trim(),
        srcLang, tgtLang, confidence:base, uses:1, source, addedAt:now, lastSeen:now })
    }
  }

  db.sort((a,b) => b.confidence - a.confidence)
  saveGlossary(db)
  return db
}

export function updateTermConfidence(id, delta) {
  const db = loadGlossary()
  const t  = db.find(e => e.id === id)
  if (t) { t.confidence = Math.max(10, Math.min(99, t.confidence + delta)); saveGlossary(db) }
}

export function deleteGlossaryTerm(id) {
  saveGlossary(loadGlossary().filter(e => e.id !== id))
}

export function clearGlossary() {
  try { localStorage.removeItem(G_KEY) } catch {}
}

// ── Parse uploaded glossary files (CSV, TSV, plain "a = b" text) ──────────────
export function parseGlossaryText(text) {
  const terms = []
  for (const line of text.split('\n')) {
    const l = line.trim()
    if (!l || l.startsWith('#')) continue
    const m = l.match(/^(.+?)\s*(?:=|,|\t)\s*(.+)$/)
    if (m) terms.push({ source: m[1].trim(), target: m[2].trim() })
  }
  return terms
}

// ── History ───────────────────────────────────────────────────────────────────
export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(H_KEY) || '[]') } catch { return [] }
}

export function addToHistory(job) {
  const h = loadHistory()
  h.unshift({ ...job, id:Math.random().toString(36).slice(2,10), ts:new Date().toISOString() })
  if (h.length > 40) h.splice(40)
  try { localStorage.setItem(H_KEY, JSON.stringify(h)) } catch {}
}

export function clearHistory() {
  try { localStorage.removeItem(H_KEY) } catch {}
}

// ── Confidentiality scanner (client-side, no API) ─────────────────────────────
const SCAN_PATTERNS = [
  { type:'Email addresses',    prefix:'EMAIL',    rx:/\b[\w.+-]+@[\w-]+\.\w{2,}\b/gi },
  { type:'Phone numbers',      prefix:'PHONE',    rx:/\+?\d[\d\s().-]{7,}\d/g },
  { type:'Financial amounts',  prefix:'AMOUNT',   rx:/\$[\d,]+(?:\.\d+)?|\b\d[\d,.]*\s*(?:USD|MNT|million|billion|тэрбум|сая)\b/gi },
  { type:'Identity / ID refs', prefix:'ID',       rx:/\b[A-Z]{1,3}[\s-]?\d{6,}\b/g },
  { type:'GPS coordinates',    prefix:'COORD',    rx:/\b\d{1,3}\.\d{4,}\s*[NnSsEeWw]\b/g },
]

export function scanSensitive(paragraphs) {
  const text    = paragraphs.map(p=>p.text).join(' ')
  const results = []
  for (const pat of SCAN_PATTERNS) {
    const matches = [...new Set((text.match(pat.rx)||[]))].slice(0,5)
    if (matches.length > 0) results.push({ type:pat.type, count:matches.length, examples:matches.join(', ') })
  }
  return results
}

export function redactParagraphs(paragraphs) {
  const map = {}   // original → placeholder
  const rev = {}   // placeholder → original
  const counts = {}
  const out = paragraphs.map(p => {
    let text = p.text
    for (const pat of SCAN_PATTERNS) {
      text = text.replace(pat.rx, m => {
        if (!map[m]) {
          counts[pat.prefix] = (counts[pat.prefix]||0)+1
          const ph = `[${pat.prefix}_${counts[pat.prefix]}]`
          map[m]=ph; rev[ph]=m
        }
        return map[m]
      })
    }
    return { ...p, text }
  })
  return { redacted:out, restore:rev }
}

export function restoreTranslations(translations, restoreMap) {
  if (!restoreMap || !Object.keys(restoreMap).length) return translations
  return translations.map(t => {
    let s = typeof t === 'string' ? t : String(t ?? '')
    for (const [ph,orig] of Object.entries(restoreMap)) s = s.split(ph).join(orig)
    return s
  })
}
