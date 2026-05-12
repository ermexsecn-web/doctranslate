import { useState, useEffect, useRef } from 'react'
import { pass1, pass2, pass3, parseFlags, stripFlags } from './translate.js'
import { parseDocx, buildDocx, downloadBlob } from './docx.js'

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  bg:'#0B0F1A', surface:'#131929', card:'#1A2235', border:'#243046',
  accent:'#F0A500', accentBg:'rgba(240,165,0,0.09)',
  text:'#EEF2FF', muted:'#8896B3', dim:'#4A5870',
  success:'#22C55E', successBg:'rgba(34,197,94,0.08)',
  info:'#60A5FA', edited:'#A78BFA', editedBg:'rgba(167,139,250,0.08)',
  danger:'#F87171',
}

const LANGS = [
  { code:'MN', label:'Mongolian' }, { code:'EN', label:'English' },
  { code:'ZH', label:'Chinese' },   { code:'RU', label:'Russian' },
  { code:'JA', label:'Japanese' },  { code:'KO', label:'Korean' },
  { code:'DE', label:'German' },    { code:'FR', label:'French' },
  { code:'ES', label:'Spanish' },
]

const TONES = [
  ['formal-legal','Formal / Legal'], ['technical','Technical'],
  ['formal','Formal'], ['general','General'], ['safety','Safety'],
]

const PASSES_META = [
  { label:'Pass 1 — Initial translation',       model:'Haiku',  desc:'Full document translated from scratch' },
  { label:'Pass 2 — Terminology & consistency',  model:'Haiku',  desc:'Glossary enforced, repeated terms unified' },
  { label:'Pass 3 — Proofread & flag',           model:'Sonnet', desc:'Ambiguous words flagged for your review' },
]

// ── Style helpers ─────────────────────────────────────────────────────────────
const W  = { fontFamily:"'system-ui',-apple-system,'Segoe UI',sans-serif", background:C.bg, color:C.text, minHeight:'100vh' }
const SC = { ...W, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'28px 16px' }
const SEL = { width:'100%', padding:'10px 12px', background:C.card, border:`1px solid ${C.border}`, borderRadius:10, color:C.text, fontSize:14, fontFamily:'inherit', outline:'none' }
const LBL = (x={}) => ({ fontSize:11, color:C.muted, letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:500, display:'block', marginBottom:7, ...x })
const CARD = (x={}) => ({ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'20px 22px', ...x })
const BTN_P = { fontFamily:'inherit', cursor:'pointer', background:C.accent, color:'#000', border:'none', borderRadius:10, padding:'12px 22px', fontSize:14, fontWeight:600 }
const BTN_S = { fontFamily:'inherit', cursor:'pointer', background:C.surface, color:C.muted, border:`1px solid ${C.border}`, borderRadius:10, padding:'12px 18px', fontSize:14, fontWeight:500 }
const statusColor = { confirmed:C.success, flagged:C.accent, edited:C.edited, normal:C.border }

export default function App() {
  // ── Core state ───────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState('upload')
  const [file,   setFile]   = useState(null)
  const [drag,   setDrag]   = useState(false)
  const [docData, setDocData] = useState(null)   // parsed docx data
  const [src,    setSrc]    = useState('EN')
  const [tgt,    setTgt]    = useState('MN')
  const [apiKey, setApiKey] = useState('')
  const [showKey,setShowKey]= useState(false)
  const [tone,   setTone]   = useState('formal-legal')
  const [ctx,    setCtx]    = useState('')
  const [userGlossary, setUserGlossary] = useState('')
  const [glossaryFile, setGlossaryFile] = useState(null)

  // ── Translation state ────────────────────────────────────────────────────────
  const [passIdx,    setPassIdx]    = useState(0)
  const [prog,       setProg]       = useState(0)
  const [donePasses, setDonePasses] = useState([])
  const [error,      setError]      = useState(null)
  const [finalTexts, setFinalTexts] = useState([])   // pass3 results

  // ── Editor state ─────────────────────────────────────────────────────────────
  const [segs,          setSegs]          = useState([])
  const [activeSegId,   setActiveSegId]   = useState(null)
  const [activeFlagWord,setActiveFlagWord]= useState(null)
  const [editingId,     setEditingId]     = useState(null)
  const [editText,      setEditText]      = useState('')
  const [customInput,   setCustomInput]   = useState('')
  const [learned,       setLearned]       = useState([])
  const [showSidebar,   setShowSidebar]   = useState(true)
  const [toast,         setToast]         = useState(null)

  const fileRef     = useRef()
  const glossRef    = useRef()
  const editRef     = useRef()
  const busyRef     = useRef(false)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600) }

  // ── Parse file on upload ──────────────────────────────────────────────────────
  const onFile = async (f) => {
    if (!f || !f.name.endsWith('.docx')) return
    setFile(f)
    try {
      const data = await parseDocx(f)
      setDocData(data)
    } catch (e) {
      setError('Could not read this file. Make sure it is a valid .docx.')
    }
  }

  // ── Run translation ───────────────────────────────────────────────────────────
  const runTranslation = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setError(null)
    setDonePasses([])
    setPassIdx(0)
    setProg(0)
    setScreen('translating')

    const texts = docData.paragraphs.map(p => p.text)
    const tgtLabel = LANGS.find(l => l.code === tgt)?.label || tgt

    try {
      // Pass 1
      setPassIdx(0)
      const p1 = await pass1(texts, apiKey, tgtLabel, userGlossary, ctx, tone, (p) => setProg(p * 100))
      setDonePasses([0])

      // Pass 2
      setPassIdx(1); setProg(0)
      const p2 = await pass2(texts, p1, apiKey, tgtLabel, userGlossary, ctx, tone, (p) => setProg(p * 100))
      setDonePasses([0, 1])

      // Pass 3
      setPassIdx(2); setProg(0)
      const p3 = await pass3(p2, apiKey, tgtLabel, userGlossary, ctx, tone, (p) => setProg(p * 100))
      setDonePasses([0, 1, 2])
      setFinalTexts(p3)

      // Build editor segments from real data
      const newSegs = docData.paragraphs.map((para, i) => {
        const rawTranslation = p3[i] || ''
        const flags = parseFlags(rawTranslation)
        const cleaned = stripFlags(rawTranslation)
        return {
          id: `s${i}`,
          original: para.text,
          translated: cleaned,
          rawTranslated: rawTranslation,
          status: flags.length > 0 ? 'flagged' : 'normal',
          flags,
        }
      })
      setSegs(newSegs)

      setTimeout(() => { busyRef.current = false; setScreen('editor') }, 600)
    } catch (e) {
      busyRef.current = false
      setError(e.message || 'Translation failed. Check your API key and try again.')
      setScreen('upload')
    }
  }

  // ── Editor actions ────────────────────────────────────────────────────────────
  const applyOption = (segId, flagWord, opt) => {
    if (!opt.text) return
    setSegs(prev => prev.map(s => {
      if (s.id !== segId) return s
      const newText  = s.translated.replace(flagWord, opt.text)
      const newFlags = s.flags.filter(f => f.word !== flagWord)
      if (opt.text !== flagWord) {
        setLearned(l => [...l, { from: flagWord, to: opt.text, note: opt.note }])
        showToast(`Saved: "${flagWord}" → "${opt.text}"`)
      } else {
        showToast(`Confirmed: "${flagWord}"`)
      }
      return { ...s, translated: newText, flags: newFlags, status: newFlags.length ? 'flagged' : (opt.text !== flagWord ? 'edited' : 'confirmed') }
    }))
    setActiveFlagWord(null); setActiveSegId(null); setCustomInput('')
  }

  const saveEdit = (segId) => {
    setSegs(prev => prev.map(s => {
      if (s.id !== segId) return s
      if (editText && editText !== s.translated) { showToast('Edit saved') }
      return { ...s, translated: editText || s.translated, status: 'edited', flags: [] }
    }))
    setEditingId(null)
  }

  const confirmSeg = (id) => setSegs(prev => prev.map(s => s.id === id ? { ...s, status:'confirmed' } : s))
  const confirmAllSafe = () => setSegs(prev => prev.map(s => s.status === 'normal' ? { ...s, status:'confirmed' } : s))

  // ── Download translated .docx ─────────────────────────────────────────────────
  const doDownload = async () => {
    if (!docData) return
    const translations = segs.map(s => s.translated)
    const blob = await buildDocx(docData.zip, docData.xml, docData.paragraphs, translations)
    const outName = (file?.name || 'document').replace('.docx', '') + `_${tgt}.docx`
    downloadBlob(blob, outName)
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const confirmed = segs.filter(s => s.status === 'confirmed').length
  const flagged   = segs.filter(s => s.status === 'flagged').length
  const edited    = segs.filter(s => s.status === 'edited').length

  // ── Render flagged words inline ───────────────────────────────────────────────
  const renderFlagged = (seg) => {
    if (!seg.flags.length) return <span>{seg.translated}</span>
    let parts = [{ t:'text', v:seg.translated }]
    for (const flag of seg.flags) {
      const next = []
      for (const part of parts) {
        if (part.t !== 'text') { next.push(part); continue }
        const i = part.v.indexOf(flag.word)
        if (i === -1) { next.push(part); continue }
        if (i > 0) next.push({ t:'text', v:part.v.slice(0, i) })
        next.push({ t:'flag', v:flag.word, flag })
        const rest = part.v.slice(i + flag.word.length)
        if (rest) next.push({ t:'text', v:rest })
      }
      parts = next
    }
    return (
      <span>
        {parts.map((p, i) => {
          if (p.t === 'text') return <span key={i}>{p.v}</span>
          const active = activeFlagWord === p.v && activeSegId === seg.id
          return (
            <span key={i}
              onClick={e => { e.stopPropagation(); setActiveSegId(seg.id); setActiveFlagWord(active ? null : p.v); setCustomInput('') }}
              style={{ background:active?'rgba(240,165,0,0.25)':'rgba(240,165,0,0.12)', borderBottom:`2px solid ${active?C.accent:'rgba(240,165,0,0.55)'}`, cursor:'pointer', padding:'1px 2px', borderRadius:3, fontWeight:active?500:400 }}>
              {p.v}<sup style={{ fontSize:8, color:C.accent, marginLeft:1 }}>▲</sup>
            </span>
          )
        })}
      </span>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UPLOAD SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (screen === 'upload') return (
    <div style={W}>
      <div style={SC}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:7, background:C.accentBg, border:`1px solid rgba(240,165,0,0.3)`, borderRadius:20, padding:'4px 14px', marginBottom:14 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:C.accent }}/>
            <span style={{ fontSize:11, color:C.accent, fontWeight:500, letterSpacing:'0.1em' }}>DocTranslate</span>
          </div>
          <h1 style={{ margin:'0 0 8px', fontSize:28, fontWeight:700, letterSpacing:'-0.02em' }}>Translate your document</h1>
          <p style={{ margin:0, color:C.muted, fontSize:14 }}>One click · 3-pass quality · Segment editor</p>
        </div>

        <div style={{ width:'100%', maxWidth:560 }}>
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer?.files[0]) }}
            style={{ border:`2px dashed ${drag?C.accent:file?C.success:C.border}`, borderRadius:14, padding:'32px 24px', textAlign:'center', cursor:'pointer', background:drag?C.accentBg:file?'rgba(34,197,94,0.06)':C.surface, transition:'all 0.2s', marginBottom:18 }}>
            <input ref={fileRef} type="file" accept=".docx" style={{ display:'none' }} onChange={e => onFile(e.target.files[0])} />
            <div style={{ fontSize:22, marginBottom:7 }}>{file?'📄':'⬆'}</div>
            {file ? (
              <>
                <div style={{ fontWeight:500, color:C.success, fontSize:15 }}>{file.name}</div>
                {docData && (
                  <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:8 }}>
                    {[['~'+docData.pageEst+' pages',''],['~'+docData.wordCount.toLocaleString()+' words',''],['est. $'+docData.costEst, C.accent]].map(([v,c],i) => (
                      <span key={i} style={{ fontSize:12, color:c||C.muted }}>{v}</span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize:11, color:C.dim, marginTop:6 }}>Click to change</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight:500, fontSize:15 }}>Drop your .docx here</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>or click to browse</div>
              </>
            )}
          </div>

          {error && <div style={{ padding:'10px 14px', background:'rgba(248,113,113,0.1)', border:`1px solid ${C.danger}44`, borderRadius:9, fontSize:13, color:C.danger, marginBottom:14 }}>⚠ {error}</div>}

          {/* Languages */}
          <div style={{ display:'flex', gap:10, alignItems:'flex-end', marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <span style={LBL()}>From</span>
              <select value={src} onChange={e => setSrc(e.target.value)} style={SEL}>
                {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <button onClick={() => { const t=src; setSrc(tgt); setTgt(t) }} style={{ ...BTN_S, padding:'10px 13px', marginBottom:1, fontSize:15 }}>⇄</button>
            <div style={{ flex:1 }}>
              <span style={LBL()}>To</span>
              <select value={tgt} onChange={e => setTgt(e.target.value)} style={SEL}>
                {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
          </div>

          {/* API key */}
          <div style={{ marginBottom:14 }}>
            <span style={LBL()}>Claude API key</span>
            <div style={{ position:'relative' }}>
              <input type={showKey?'text':'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                style={{ ...SEL, paddingRight:40, fontFamily:'monospace', fontSize:13, boxSizing:'border-box' }} />
              <button onClick={() => setShowKey(!showKey)} style={{ position:'absolute', right:11, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:13, padding:0 }}>
                {showKey?'🙈':'👁'}
              </button>
            </div>
            <div style={{ fontSize:11, color:C.dim, marginTop:4 }}>Never stored — cleared when you close this tab</div>
          </div>

          {/* Optional settings — collapsible feel */}
          <details style={{ marginBottom:16 }}>
            <summary style={{ fontSize:13, color:C.muted, cursor:'pointer', padding:'8px 0', listStyle:'none', display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:10 }}>▶</span> Optional settings (tone, context, glossary)
            </summary>
            <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:12 }}>
              {/* Tone */}
              <div>
                <span style={LBL()}>Document tone</span>
                <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
                  {TONES.map(([v,l]) => (
                    <div key={v} onClick={() => setTone(v)} style={{ padding:'5px 11px', borderRadius:7, border:`1.5px solid ${tone===v?C.accent:C.border}`, cursor:'pointer', background:tone===v?C.accentBg:C.card, color:tone===v?C.accent:C.muted, fontSize:12, fontWeight:tone===v?500:400, transition:'all 0.15s' }}>{l}</div>
                  ))}
                </div>
              </div>
              {/* Context */}
              <div>
                <span style={LBL()}>Context <span style={{ color:C.dim, textTransform:'none', letterSpacing:'normal' }}>(helps with technical/legal docs)</span></span>
                <textarea value={ctx} onChange={e => setCtx(e.target.value)}
                  placeholder="e.g. Official OT resolution for bank signatories in Singapore. Formal legal register."
                  style={{ width:'100%', padding:'9px 11px', background:C.card, border:`1px solid ${C.border}`, borderRadius:9, color:C.text, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', minHeight:60, boxSizing:'border-box', lineHeight:1.5 }} />
              </div>
              {/* Glossary */}
              <div>
                <span style={LBL()}>Additional glossary <span style={{ color:C.dim, textTransform:'none', letterSpacing:'normal' }}>(paste term=translation pairs, one per line)</span></span>
                <textarea value={userGlossary} onChange={e => setUserGlossary(e.target.value)}
                  placeholder="e.g. Underground Mine = Газар доорхи уурхай"
                  style={{ width:'100%', padding:'9px 11px', background:C.card, border:`1px solid ${C.border}`, borderRadius:9, color:C.text, fontSize:13, fontFamily:'monospace', outline:'none', resize:'vertical', minHeight:60, boxSizing:'border-box', lineHeight:1.6 }} />
              </div>
            </div>
          </details>

          {/* Primary CTA */}
          <button
            onClick={runTranslation}
            disabled={!file || !apiKey || !docData}
            style={{ ...BTN_P, width:'100%', padding:'14px', fontSize:16, opacity:(!file||!apiKey||!docData)?0.45:1, cursor:(!file||!apiKey||!docData)?'not-allowed':'pointer' }}>
            ⚡ Translate everything
          </button>
          <div style={{ textAlign:'center', color:C.dim, fontSize:11, marginTop:10 }}>
            Haiku × 2 passes + Sonnet × 1 proofread · OT glossary auto-applied
          </div>
        </div>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // TRANSLATING SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (screen === 'translating') return (
    <div style={W}>
      <div style={SC}>
        <div style={{ width:'100%', maxWidth:490 }}>
          <div style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{ fontSize:11, color:C.accent, letterSpacing:'0.12em', fontWeight:500, marginBottom:9 }}>TRANSLATING</div>
            <div style={{ fontWeight:600, fontSize:17 }}>{file?.name}</div>
            <div style={{ color:C.muted, fontSize:13, marginTop:5 }}>
              {LANGS.find(l=>l.code===src)?.label} → {LANGS.find(l=>l.code===tgt)?.label} · {tone}
            </div>
          </div>

          {PASSES_META.map((p, i) => {
            const done   = donePasses.includes(i)
            const active = passIdx === i && !done
            return (
              <div key={i} style={{ background:C.surface, border:`1px solid ${done?C.success:active?C.accent:C.border}`, borderRadius:13, padding:'15px 18px', marginBottom:10, opacity:i>passIdx?0.35:1, transition:'all 0.3s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:active?12:0 }}>
                  <div style={{ width:30, height:30, borderRadius:'50%', background:done?C.success:active?C.accent:C.border, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:done||active?'#000':C.muted, transition:'background 0.25s' }}>{done?'✓':i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500, fontSize:13, color:done?C.success:active?C.accent:C.muted }}>{p.label}</div>
                    <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>{p.desc} · <span style={{ color:active?C.accent:C.dim }}>{p.model}</span></div>
                  </div>
                  {done   && <span style={{ fontSize:11, color:C.success }}>Done</span>}
                  {active && <span style={{ fontSize:12, color:C.accent, fontFamily:'monospace' }}>{Math.round(prog)}%</span>}
                </div>
                {active && <div style={{ height:3, background:C.border, borderRadius:3, overflow:'hidden' }}><div style={{ height:'100%', background:C.accent, width:`${prog}%`, transition:'width 0.1s' }}/></div>}
              </div>
            )
          })}
          <div style={{ textAlign:'center', marginTop:14, color:C.dim, fontSize:12 }}>
            {donePasses.length < 3 ? 'Do not close this tab' : 'Opening segment editor...'}
          </div>
        </div>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // EDITOR SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (screen === 'editor') return (
    <div style={{ ...W, display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'10px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ fontSize:13, fontWeight:600 }}>📄 {file?.name}</span>
          <div style={{ display:'flex', gap:6 }}>
            {[[flagged,C.accent,`${flagged} flagged`],[edited,C.edited,`${edited} edited`],[confirmed,C.success,`${confirmed} confirmed`]].map(([count,color,label]) => count>0 && (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 9px', background:color+'18', border:`1px solid ${color}44`, borderRadius:6 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:color }}/>
                <span style={{ fontSize:11, color }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:'flex', gap:7 }}>
          <button onClick={confirmAllSafe} style={{ ...BTN_S, padding:'6px 12px', fontSize:12 }}>Confirm safe</button>
          <button onClick={doDownload}     style={{ ...BTN_P, padding:'7px 15px', fontSize:13 }}>Download ↓</button>
        </div>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* Segment list */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
          {/* Column headers */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
            <div style={{ fontSize:10, color:C.dim, fontWeight:500, letterSpacing:'0.12em', textTransform:'uppercase', padding:'5px 10px', background:C.surface, borderRadius:6, textAlign:'center', border:`1px solid ${C.border}` }}>Original</div>
            <div style={{ fontSize:10, color:C.accent, fontWeight:500, letterSpacing:'0.12em', textTransform:'uppercase', padding:'5px 10px', background:C.accentBg, borderRadius:6, textAlign:'center', border:`1px solid rgba(240,165,0,0.3)` }}>Translation</div>
          </div>

          {segs.map(seg => {
            const isEditing   = editingId === seg.id
            const hasActiveFlag = activeSegId === seg.id && activeFlagWord
            const sColor      = statusColor[seg.status] || C.border
            const activeFlag  = seg.flags.find(f => f.word === activeFlagWord)

            return (
              <div key={seg.id} style={{ marginBottom:8 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', background:C.card, border:`1px solid ${hasActiveFlag?C.accent:sColor}`, borderRadius:hasActiveFlag?'11px 11px 0 0':11, overflow:'hidden', transition:'border-color 0.2s' }}>
                  {/* Original */}
                  <div style={{ padding:'11px 13px', borderRight:`1px solid ${C.border}`, borderLeft:`3px solid ${sColor}`, transition:'border-color 0.2s' }}>
                    <div style={{ fontSize:11, color:C.dim, lineHeight:1.65 }}>{seg.original}</div>
                  </div>
                  {/* Translated */}
                  <div style={{ padding:'11px 13px' }}>
                    {isEditing ? (
                      <div>
                        <textarea ref={editRef} value={editText} onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => { if (e.key==='Escape') setEditingId(null); if (e.key==='Enter'&&e.metaKey) saveEdit(seg.id) }}
                          style={{ width:'100%', minHeight:60, padding:'7px 9px', background:C.surface, border:`1px solid ${C.accent}`, borderRadius:7, color:C.text, fontSize:12, fontFamily:'inherit', outline:'none', resize:'vertical', lineHeight:1.6, boxSizing:'border-box' }}/>
                        <div style={{ display:'flex', gap:6, marginTop:7 }}>
                          <button onClick={() => saveEdit(seg.id)}    style={{ ...BTN_P, padding:'4px 12px', fontSize:11 }}>Save</button>
                          <button onClick={() => setEditingId(null)}  style={{ ...BTN_S, padding:'4px 10px', fontSize:11 }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:'flex', alignItems:'flex-start', gap:7 }}>
                        <div style={{ flex:1, fontSize:11, color:C.text, lineHeight:1.65 }}>
                          {seg.flags.length > 0 ? renderFlagged(seg) : seg.translated}
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
                          {seg.status !== 'confirmed' && (
                            <button onClick={e => { e.stopPropagation(); setEditingId(seg.id); setEditText(seg.translated); setActiveFlagWord(null); setTimeout(() => editRef.current?.focus(), 50) }}
                              title="Edit" style={{ width:22, height:22, background:C.surface, border:`1px solid ${C.border}`, borderRadius:5, color:C.muted, fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✎</button>
                          )}
                          {seg.status === 'normal' && !seg.flags.length && (
                            <button onClick={e => { e.stopPropagation(); confirmSeg(seg.id) }}
                              style={{ width:22, height:22, background:C.successBg, border:`1px solid ${C.success}44`, borderRadius:5, color:C.success, fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✓</button>
                          )}
                          {seg.status === 'confirmed' && <div style={{ width:22, height:22, background:C.successBg, border:`1px solid ${C.success}44`, borderRadius:5, color:C.success, fontSize:11, display:'flex', alignItems:'center', justifyContent:'center' }}>✓</div>}
                          {seg.status === 'edited'    && <div style={{ fontSize:8, padding:'2px 4px', background:C.editedBg, border:`1px solid ${C.edited}44`, borderRadius:4, color:C.edited, textAlign:'center' }}>edited</div>}
                          {seg.flags.length > 0       && <div style={{ fontSize:8, padding:'2px 4px', background:C.accentBg, border:`1px solid ${C.accent}44`, borderRadius:4, color:C.accent, textAlign:'center' }}>{seg.flags.length}▲</div>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Flag options panel */}
                {hasActiveFlag && activeFlag && (
                  <div onClick={e => e.stopPropagation()} style={{ background:C.surface, border:`1px solid ${C.accent}`, borderTop:'none', borderRadius:'0 0 11px 11px', padding:'13px 15px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:11 }}>
                      <div>
                        <span style={{ fontSize:10, color:C.accent, fontWeight:600, letterSpacing:'0.1em' }}>OPTIONS FOR</span>
                        <span style={{ fontSize:11, color:C.accent, fontWeight:500, marginLeft:6 }}>"{activeFlagWord}"</span>
                      </div>
                      <button onClick={() => { setActiveFlagWord(null); setActiveSegId(null) }} style={{ background:'none', border:'none', color:C.dim, cursor:'pointer', fontSize:13, padding:0 }}>✕</button>
                    </div>
                    <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                      {activeFlag.options.filter(o => o.text).map((opt, oi) => (
                        <div key={oi} onClick={() => applyOption(seg.id, activeFlagWord, opt)}
                          style={{ flex:1, padding:'10px 12px', borderRadius:9, border:`1.5px solid ${oi===0?C.accent:C.border}`, cursor:'pointer', background:oi===0?C.accentBg:C.card, transition:'all 0.15s' }}>
                          <div style={{ fontWeight:600, fontSize:12, color:oi===0?C.accent:C.text, marginBottom:4 }}>{opt.text}</div>
                          <div style={{ fontSize:10, color:C.dim, lineHeight:1.45, marginBottom:6 }}>{opt.note}</div>
                          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <div style={{ flex:1, height:2, background:C.border, borderRadius:2 }}>
                              <div style={{ height:'100%', borderRadius:2, background:oi===0?C.accent:C.info, width:`${opt.confidence}%` }}/>
                            </div>
                            <span style={{ fontSize:9, color:C.dim, fontFamily:'monospace' }}>{opt.confidence}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <input value={customInput} onChange={e => setCustomInput(e.target.value)}
                        onKeyDown={e => { if (e.key==='Enter'&&customInput.trim()) applyOption(seg.id, activeFlagWord, { text:customInput.trim(), note:'Custom edit', confidence:100 }) }}
                        placeholder={`Type your own translation for "${activeFlagWord}"...`}
                        style={{ flex:1, padding:'7px 11px', background:C.card, border:`1px solid ${C.border}`, borderRadius:7, color:C.text, fontSize:11, fontFamily:'inherit', outline:'none' }}/>
                      {customInput.trim() && <button onClick={() => applyOption(seg.id, activeFlagWord, { text:customInput.trim(), note:'Custom edit', confidence:100 })} style={{ ...BTN_P, padding:'7px 13px', fontSize:11 }}>Apply</button>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Learned sidebar */}
        {showSidebar && (
          <div style={{ width:230, background:C.surface, borderLeft:`1px solid ${C.border}`, display:'flex', flexDirection:'column', flexShrink:0 }}>
            <div style={{ padding:'11px 13px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <span style={{ fontSize:12, fontWeight:500 }}>Learned this session</span>
                {learned.length > 0 && <span style={{ fontSize:10, padding:'1px 6px', background:C.accentBg, border:`1px solid ${C.accent}44`, borderRadius:10, color:C.accent, fontWeight:600 }}>{learned.length}</span>}
              </div>
              <button onClick={() => setShowSidebar(false)} style={{ background:'none', border:'none', color:C.dim, cursor:'pointer', fontSize:13, padding:0 }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'10px 11px' }}>
              {learned.length === 0
                ? <div style={{ textAlign:'center', padding:'24px 10px' }}>
                    <div style={{ fontSize:22, marginBottom:10 }}>📚</div>
                    <div style={{ fontSize:11, color:C.dim, lineHeight:1.55 }}>Click <span style={{ color:C.accent }}>amber ▲ words</span> to review alternatives.<br/><br/>Your choices are saved here.</div>
                  </div>
                : learned.map((t,i) => (
                    <div key={i} style={{ padding:'9px 10px', background:C.card, borderRadius:8, marginBottom:7, borderLeft:`3px solid ${C.accent}` }}>
                      <div style={{ fontSize:11, color:C.muted, marginBottom:2 }}>"{t.from}"</div>
                      <div style={{ fontSize:10, color:C.dim, marginBottom:3 }}>→</div>
                      <div style={{ fontSize:12, fontWeight:500, color:C.accent }}>"{t.to}"</div>
                      <div style={{ fontSize:10, color:C.dim, marginTop:3 }}>{t.note}</div>
                    </div>
                  ))
              }
            </div>
            <div style={{ padding:'11px 13px', borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:10, color:C.dim, marginBottom:6 }}>Progress</div>
              <div style={{ height:3, background:C.border, borderRadius:2, overflow:'hidden', marginBottom:5 }}>
                <div style={{ height:'100%', background:C.success, width:`${segs.length?(confirmed/segs.length*100):0}%`, transition:'width 0.3s', borderRadius:2 }}/>
              </div>
              <div style={{ fontSize:11, color:C.muted }}>{confirmed} of {segs.length} confirmed</div>
              {flagged > 0 && <div style={{ fontSize:10, color:C.accent, marginTop:2 }}>{flagged} still need review</div>}
            </div>
          </div>
        )}
        {!showSidebar && (
          <button onClick={() => setShowSidebar(true)} style={{ position:'fixed', right:12, bottom:60, padding:'8px 13px', background:C.surface, border:`1px solid ${C.border}`, borderRadius:9, color:C.muted, fontSize:12, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, zIndex:20 }}>
            📚 {learned.length > 0 && <span style={{ background:C.accent, color:'#000', borderRadius:'50%', width:16, height:16, fontSize:9, display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>{learned.length}</span>} Learned
          </button>
        )}
      </div>

      {toast && (
        <div style={{ position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)', background:C.success, color:'#000', padding:'8px 18px', borderRadius:8, fontSize:12, fontWeight:500, zIndex:100, whiteSpace:'nowrap', pointerEvents:'none' }}>
          ✓ {toast}
        </div>
      )}
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // DONE / FALLBACK
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={W}>
      <div style={SC}>
        <div style={{ width:'100%', maxWidth:420, textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:16 }}>✓</div>
          <h2 style={{ margin:'0 0 6px', fontSize:22, fontWeight:700 }}>Ready to download</h2>
          <p style={{ color:C.muted, fontSize:14, margin:'0 0 24px' }}>{learned.length} terms learned · {edited} segments edited</p>
          <button onClick={doDownload} style={{ ...BTN_P, width:'100%', padding:'13px', fontSize:15, marginBottom:9 }}>↓ Download translated .docx</button>
          <button onClick={() => { setScreen('upload'); setFile(null); setDocData(null); setSegs([]); setLearned([]); busyRef.current=false }} style={{ ...BTN_S, width:'100%', padding:'11px', fontSize:14 }}>Translate another</button>
        </div>
      </div>
    </div>
  )
}
