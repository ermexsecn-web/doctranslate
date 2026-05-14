import { useState, useRef, useEffect } from 'react'
import { pass1, pass2, pass3, parseFlags, stripFlags, analyzeReference } from './translate.js'
import { parseDocx, extractTextOnly, buildDocx, downloadBlob } from './docx.js'
import { loadGlossary, mergeTerms, deleteGlossaryTerm, clearGlossary,
         parseGlossaryText, loadHistory, addToHistory, clearHistory,
         scanSensitive, redactParagraphs, restoreTranslations } from './storage.js'

const C={bg:'#0B0F1A',surface:'#131929',card:'#1A2235',border:'#243046',
  accent:'#F0A500',accentBg:'rgba(240,165,0,0.09)',
  text:'#EEF2FF',muted:'#8896B3',dim:'#4A5870',
  success:'#22C55E',successBg:'rgba(34,197,94,0.08)',
  info:'#60A5FA',infoBg:'rgba(96,165,250,0.08)',
  edited:'#A78BFA',editedBg:'rgba(167,139,250,0.08)',
  danger:'#F87171',dangerBg:'rgba(248,113,113,0.08)',
  warning:'#FBBF24',warningBg:'rgba(251,191,36,0.08)'}
const LANGS=[{code:'MN',label:'Mongolian'},{code:'EN',label:'English'},{code:'ZH',label:'Chinese'},{code:'RU',label:'Russian'},{code:'JA',label:'Japanese'},{code:'KO',label:'Korean'},{code:'DE',label:'German'},{code:'FR',label:'French'},{code:'ES',label:'Spanish'}]
const TONES=[['formal-legal','Formal/Legal'],['technical','Technical'],['formal','Formal'],['general','General'],['safety','Safety']]
const PASSES_META=[{label:'Pass 1 — Initial translation',model:'Haiku',desc:'Full document translated from scratch'},{label:'Pass 2 — Terminology & consistency',model:'Haiku',desc:'Glossary enforced, terms unified'},{label:'Pass 3 — Proofread & flag',model:'Sonnet',desc:'Final pass, uncertain words flagged'}]
const W={fontFamily:"'system-ui',-apple-system,'Segoe UI',sans-serif",background:C.bg,color:C.text,minHeight:'100vh'}
const SC={...W,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'24px 16px'}
const SEL={width:'100%',padding:'10px 12px',background:C.card,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:14,fontFamily:'inherit',outline:'none'}
const LBL=(x={})=>({fontSize:11,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:500,display:'block',marginBottom:6,...x})
const CARD=(x={})=>({background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'16px 18px',...x})
const BP={fontFamily:'inherit',cursor:'pointer',background:C.accent,color:'#000',border:'none',borderRadius:10,padding:'11px 20px',fontSize:13,fontWeight:600}
const BS={fontFamily:'inherit',cursor:'pointer',background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:10,padding:'11px 16px',fontSize:13,fontWeight:500}
const statusColor={confirmed:C.success,flagged:C.accent,edited:C.edited,normal:C.border}

export default function App(){
  // Core
  const [screen,setScreen]=useState('upload')
  const [settingsTab,setSettingsTab]=useState('document')
  const [file,setFile]=useState(null),[drag,setDrag]=useState(false),[docData,setDocData]=useState(null)
  const [src,setSrc]=useState('EN'),[tgt,setTgt]=useState('MN')
  const [apiKey,setApiKey]=useState(''),[showKey,setShowKey]=useState(false)
  const [tone,setTone]=useState('formal-legal'),[ctx,setCtx]=useState('')
  const [userGlossary,setUserGlossary]=useState('')
  const [partialSpec,setPartialSpec]=useState('')
  const [customInstructions,setCustomInstructions]=useState('')
  // References (up to 3)
  const [refs,setRefs]=useState([null,null,null])
  const [refAnalyses,setRefAnalyses]=useState([null,null,null])
  const [refReviewIdx,setRefReviewIdx]=useState(0)
  const [refNotes,setRefNotes]=useState(['','',''])
  // Glossary DB
  const [glossaryDB,setGlossaryDB]=useState([])
  const [glossaryFiles,setGlossaryFiles]=useState([])
  // Confidentiality
  const [privacyMode,setPrivacyMode]=useState(true)
  const [sensitiveItems,setSensitiveItems]=useState([])
  const [redactChoice,setRedactChoice]=useState('redact')
  const [restoreMap,setRestoreMap]=useState(null)
  // Translation progress
  const [passIdx,setPassIdx]=useState(0),[prog,setProg]=useState(0),[donePasses,setDonePasses]=useState([])
  const [error,setError]=useState(null)
  // Editor
  const [segs,setSegs]=useState([])
  const [activeSegId,setActiveSegId]=useState(null),[activeFlagWord,setActiveFlagWord]=useState(null)
  const [editingId,setEditingId]=useState(null),[editText,setEditText]=useState(''),[customInput,setCustomInput]=useState('')
  const [learned,setLearned]=useState([]),[showSidebar,setShowSidebar]=useState(true),[toast,setToast]=useState(null)
  // History / Glossary panels
  const [showHistory,setShowHistory]=useState(false)
  const [showGlossaryMgr,setShowGlossaryMgr]=useState(false)
  const [history,setHistory]=useState([])
  // Job timing
  const jobStartRef=useRef(null)
  const fileRef=useRef(),refRefs=[useRef(),useRef(),useRef()],glossaryFileRef=useRef(),editRef=useRef(),busyRef=useRef(false)

  useEffect(()=>{setGlossaryDB(loadGlossary());setHistory(loadHistory())},[])
  const showToast=(msg)=>{setToast(msg);setTimeout(()=>setToast(null),2600)}

  const onFile=async(f)=>{
    if(!f||!f.name.endsWith('.docx'))return
    setFile(f);setError(null)
    try{setDocData(await parseDocx(f))}catch(e){setError('Could not read: '+e.message)}
  }

  const onRefFile=async(idx,f)=>{
    if(!f)return
    const nr=[...refs];nr[idx]=f;setRefs(nr)
    const na=[...refAnalyses];na[idx]=null;setRefAnalyses(na)
  }

  const removeRef=(idx)=>{
    const nr=[...refs];nr[idx]=null;setRefs(nr)
    const na=[...refAnalyses];na[idx]=null;setRefAnalyses(na)
  }

  const onGlossaryFile=async(f)=>{
    if(!f)return
    const text=await f.text()
    const terms=parseGlossaryText(text)
    if(terms.length>0){
      const updated=mergeTerms(terms,'glossary-file',src,tgt)
      setGlossaryDB(updated)
      setGlossaryFiles(prev=>[...prev,{name:f.name,count:terms.length}])
      showToast(`Glossary: ${terms.length} terms added from ${f.name}`)
    }
  }

  // ── Main translate entry point ─────────────────────────────────────────────
  const handleTranslateClick=async()=>{
    if(busyRef.current||!file||!apiKey||!docData)return
    setError(null)
    // Step 1: Privacy scan
    if(privacyMode){
      const items=scanSensitive(docData.paragraphs)
      if(items.length>0){setSensitiveItems(items);setScreen('privacy-review');return}
    }
    // Step 2: Reference files to analyze?
    const pendingRefs=refs.map((r,i)=>({r,i})).filter(({r,i})=>r&&!refAnalyses[i])
    if(pendingRefs.length>0){setRefReviewIdx(pendingRefs[0].i);await analyzeNextRef(pendingRefs[0].i);return}
    // Step 3: Translate
    startTranslation()
  }

  const proceedFromPrivacy=async()=>{
    let paragraphs=docData.paragraphs
    let rMap=null
    if(redactChoice==='redact'){
      const{redacted,restore}=redactParagraphs(paragraphs)
      paragraphs=[...docData.paragraphs]; // keep originals for docx rebuild
      setRestoreMap(restore); rMap=restore
      // Use redacted texts for API calls only
      setDocData(prev=>({...prev,_redactedParagraphs:redacted,restoreMap:restore}))
    }
    const pendingRefs=refs.map((r,i)=>({r,i})).filter(({r,i})=>r&&!refAnalyses[i])
    if(pendingRefs.length>0){setRefReviewIdx(pendingRefs[0].i);await analyzeNextRef(pendingRefs[0].i);return}
    startTranslation()
  }

  const analyzeNextRef=async(idx)=>{
    if(busyRef.current)return
    busyRef.current=true
    setScreen('analyzing-ref')
    try{
      const text=await extractTextOnly(refs[idx])
      const analysis=await analyzeReference(text,apiKey,LANGS.find(l=>l.code===src)?.label||src,LANGS.find(l=>l.code===tgt)?.label||tgt)
      const na=[...refAnalyses];na[idx]=analysis;setRefAnalyses(na)
      const nn=[...refNotes];nn[idx]=analysis.summary||'';setRefNotes(nn)
      // Auto-merge terms into glossary DB
      if(analysis.keyTerms?.length>0){
        const updated=mergeTerms(analysis.keyTerms.map(t=>({source:t.source,target:t.target})),'reference',src,tgt)
        setGlossaryDB(updated)
      }
      busyRef.current=false
      setScreen('ref-review')
    }catch(e){
      busyRef.current=false
      setError('Reference analysis failed: '+e.message)
      const na=[...refAnalyses];na[idx]={};setRefAnalyses(na) // mark as skipped
      proceedAfterRefs([...refAnalyses].map((a,i)=>i===idx?{}:a))
    }
  }

  const confirmRef=(idx)=>{
    // Update notes into analysis
    const na=[...refAnalyses]
    if(na[idx])na[idx]={...na[idx],summary:refNotes[idx]||na[idx]?.summary}
    setRefAnalyses(na)
    // Check if more refs to analyze
    const nextPending=refs.findIndex((r,i)=>r&&!na[i]&&i>idx)
    if(nextPending>=0){setRefReviewIdx(nextPending);analyzeNextRef(nextPending)}
    else startTranslation(na)
  }

  const proceedAfterRefs=(analyses)=>startTranslation(analyses)

  const startTranslation=async(currentAnalyses)=>{
    if(busyRef.current)return
    busyRef.current=true
    setError(null);setDonePasses([]);setPassIdx(0);setProg(0)
    jobStartRef.current=Date.now()
    setScreen('translating')
    const analyses=(currentAnalyses||refAnalyses).filter(Boolean).filter(a=>a&&a.docType)
    const useParas=docData._redactedParagraphs||docData.paragraphs
    const texts=useParas.map(p=>p.text)
    const tgtLabel=LANGS.find(l=>l.code===tgt)?.label||tgt
    const dbForPrompt=glossaryDB.filter(g=>g.srcLang===src&&g.tgtLang===tgt)
    try{
      setPassIdx(0)
      const p1=await pass1(texts,apiKey,tgtLabel,userGlossary,dbForPrompt,ctx,tone,analyses,partialSpec,customInstructions,p=>setProg(p*100))
      setDonePasses([0])
      setPassIdx(1);setProg(0)
      const p2=await pass2(texts,p1,apiKey,tgtLabel,userGlossary,dbForPrompt,ctx,tone,analyses,partialSpec,customInstructions,p=>setProg(p*100))
      setDonePasses([0,1])
      setPassIdx(2);setProg(0)
      const p3=await pass3(p2,apiKey,tgtLabel,userGlossary,dbForPrompt,ctx,tone,analyses,partialSpec,customInstructions,p=>setProg(p*100))
      setDonePasses([0,1,2])
      // Restore redacted content
      const finalTexts=restoreTranslations(p3,docData.restoreMap||restoreMap)
      const newSegs=docData.paragraphs.map((para,i)=>{
        const raw=finalTexts[i]||'',flags=parseFlags(raw),cleaned=stripFlags(raw)
        return{id:`s${i}`,original:para.text,translated:cleaned,status:flags.length>0?'flagged':'normal',flags}
      })
      setSegs(newSegs)
      // Save to history
      const duration=Math.round((Date.now()-jobStartRef.current)/1000)
      addToHistory({filename:file.name,srcLang:src,tgtLang:tgt,wordCount:docData.wordCount,pageEst:docData.pageEst,cost:docData.costEst,duration,status:'complete',refFiles:refs.filter(Boolean).map(r=>r.name),customInstructions:partialSpec||customInstructions||''})
      setHistory(loadHistory())
      setTimeout(()=>{busyRef.current=false;setScreen('editor')},600)
    }catch(e){
      busyRef.current=false;setError(e.message||'Translation failed.');setScreen('upload')
    }
  }

  // Editor actions
  const applyOption=(segId,flagWord,opt)=>{
    if(!opt.text)return
    setSegs(prev=>prev.map(s=>{
      if(s.id!==segId)return s
      const newText=s.translated.replace(flagWord,opt.text)
      const newFlags=s.flags.filter(f=>f.word!==flagWord)
      if(opt.text!==flagWord){
        setLearned(l=>[...l,{from:flagWord,to:opt.text,note:opt.note}])
        const updated=mergeTerms([{source:flagWord,target:opt.text}],'learned',src,tgt)
        setGlossaryDB(updated)
        showToast(`Saved: "${flagWord}" → "${opt.text}"`)
      } else showToast(`Confirmed: "${flagWord}"`)
      return{...s,translated:newText,flags:newFlags,status:newFlags.length?'flagged':(opt.text!==flagWord?'edited':'confirmed')}
    }))
    setActiveFlagWord(null);setActiveSegId(null);setCustomInput('')
  }
  const saveEdit=(segId)=>{
    setSegs(prev=>prev.map(s=>s.id===segId?{...s,translated:editText||s.translated,status:'edited',flags:[]}:s))
    showToast('Edit saved');setEditingId(null)
  }
  const confirmSeg=(id)=>setSegs(prev=>prev.map(s=>s.id===id?{...s,status:'confirmed'}:s))
  const confirmAllSafe=()=>setSegs(prev=>prev.map(s=>s.status==='normal'?{...s,status:'confirmed'}:s))
  const doDownload=async()=>{
    if(!docData)return
    const blob=await buildDocx(docData.zip,docData.xml,docData.paragraphs,segs.map(s=>s.translated))
    downloadBlob(blob,(file?.name||'document').replace('.docx','')+`_${tgt}.docx`)
  }
  const confirmed=segs.filter(s=>s.status==='confirmed').length
  const flagged=segs.filter(s=>s.status==='flagged').length
  const edited=segs.filter(s=>s.status==='edited').length

  const renderFlagged=(seg)=>{
    if(!seg.flags.length)return<span>{seg.translated}</span>
    let parts=[{t:'text',v:seg.translated}]
    for(const flag of seg.flags){const next=[];for(const p of parts){if(p.t!=='text'){next.push(p);continue}const i=p.v.indexOf(flag.word);if(i===-1){next.push(p);continue}if(i>0)next.push({t:'text',v:p.v.slice(0,i)});next.push({t:'flag',v:flag.word,flag});const r=p.v.slice(i+flag.word.length);if(r)next.push({t:'text',v:r})};parts=next}
    return<span>{parts.map((p,i)=>{if(p.t==='text')return<span key={i}>{p.v}</span>;const a=activeFlagWord===p.v&&activeSegId===seg.id;return<span key={i} onClick={e=>{e.stopPropagation();setActiveSegId(seg.id);setActiveFlagWord(a?null:p.v);setCustomInput('')}} style={{background:a?'rgba(240,165,0,0.25)':'rgba(240,165,0,0.12)',borderBottom:`2px solid ${a?C.accent:'rgba(240,165,0,0.55)'}`,cursor:'pointer',padding:'1px 2px',borderRadius:3,fontWeight:a?500:400}}>{p.v}<sup style={{fontSize:8,color:C.accent,marginLeft:1}}>▲</sup></span>})}</span>
  }

  const Toggle=({on,set})=><div onClick={()=>set(!on)} style={{width:40,height:22,borderRadius:11,background:on?C.accent:C.border,cursor:'pointer',position:'relative',transition:'background 0.2s',flexShrink:0}}><div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:on?21:3,transition:'left 0.2s'}}/></div>

  const refCount=refs.filter(Boolean).length

  // ══════════════════════════════════════════════════════════════════
  // HISTORY PANEL
  // ══════════════════════════════════════════════════════════════════
  const HistoryPanel=()=>(
    <div style={{position:'fixed',top:0,right:0,bottom:0,width:320,background:C.surface,borderLeft:`1px solid ${C.border}`,zIndex:50,display:'flex',flexDirection:'column',boxShadow:'-4px 0 24px rgba(0,0,0,0.4)'}}>
      <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontWeight:600,fontSize:14}}>Translation history</span>
        <button onClick={()=>setShowHistory(false)} style={{background:'none',border:'none',color:C.dim,cursor:'pointer',fontSize:16,padding:0}}>✕</button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'10px 12px'}}>
        {history.length===0?<div style={{textAlign:'center',padding:'40px 16px',color:C.dim,fontSize:13}}>No translations yet</div>:
          history.map((h,i)=>(
            <div key={h.id||i} style={{...CARD({marginBottom:8,padding:'12px 14px'})}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                <span style={{fontSize:12,fontWeight:500,color:C.text}}>{h.filename}</span>
                <span style={{fontSize:10,color:h.status==='complete'?C.success:C.danger}}>{h.status}</span>
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                {[h.srcLang+'→'+h.tgtLang,'~'+h.wordCount+' words','$'+h.cost,h.duration+'s',new Date(h.ts).toLocaleDateString()].map((v,j)=>(
                  <span key={j} style={{fontSize:10,color:C.muted}}>{v}</span>
                ))}
              </div>
              {h.refFiles?.length>0&&<div style={{fontSize:10,color:C.info,marginTop:4}}>Refs: {h.refFiles.join(', ')}</div>}
              {h.customInstructions&&<div style={{fontSize:10,color:C.dim,marginTop:3,fontStyle:'italic'}}>"{h.customInstructions.slice(0,60)}"</div>}
            </div>
          ))
        }
      </div>
      <div style={{padding:'12px',borderTop:`1px solid ${C.border}`}}>
        <button onClick={()=>{clearHistory();setHistory([])}} style={{...BS,width:'100%',fontSize:12,padding:'8px',color:C.danger,borderColor:C.danger+'44'}}>Clear history</button>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════
  // GLOSSARY MANAGER PANEL
  // ══════════════════════════════════════════════════════════════════
  const GlossaryPanel=()=>{
    const filtered=glossaryDB.filter(g=>g.srcLang===src&&g.tgtLang===tgt)
    return(
      <div style={{position:'fixed',top:0,right:0,bottom:0,width:380,background:C.surface,borderLeft:`1px solid ${C.border}`,zIndex:50,display:'flex',flexDirection:'column',boxShadow:'-4px 0 24px rgba(0,0,0,0.4)'}}>
        <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <span style={{fontWeight:600,fontSize:14}}>Glossary database</span>
            <span style={{fontSize:11,color:C.muted,marginLeft:8}}>{filtered.length} terms ({src}→{tgt})</span>
          </div>
          <button onClick={()=>setShowGlossaryMgr(false)} style={{background:'none',border:'none',color:C.dim,cursor:'pointer',fontSize:16,padding:0}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'10px 12px'}}>
          {filtered.length===0?<div style={{textAlign:'center',padding:'40px 16px',color:C.dim,fontSize:13}}>No terms yet.<br/>Upload reference files or glossary files to populate.</div>:
            filtered.map((t)=>(
              <div key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',background:C.card,borderRadius:8,marginBottom:5,borderLeft:`3px solid ${t.confidence>85?C.success:t.confidence>70?C.warning:C.border}`}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:C.text}}>{t.src}</div>
                  <div style={{fontSize:11,color:C.accent,marginTop:1}}>→ {t.tgt}</div>
                  <div style={{fontSize:10,color:C.dim,marginTop:1}}>{t.source} · {t.confidence}% confidence · used {t.uses}×</div>
                </div>
                <button onClick={()=>{deleteGlossaryTerm(t.id);setGlossaryDB(loadGlossary())}} style={{background:'none',border:'none',color:C.dim,cursor:'pointer',fontSize:13,padding:'2px 4px',flexShrink:0}}>✕</button>
              </div>
            ))
          }
        </div>
        <div style={{padding:'12px',borderTop:`1px solid ${C.border}`,display:'flex',gap:8}}>
          <button onClick={()=>glossaryFileRef.current?.click()} style={{...BP,flex:1,fontSize:12,padding:'8px'}}>+ Upload glossary</button>
          <button onClick={()=>{clearGlossary();setGlossaryDB([])}} style={{...BS,fontSize:12,padding:'8px',color:C.danger,borderColor:C.danger+'44'}}>Clear all</button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  // UPLOAD SCREEN
  // ══════════════════════════════════════════════════════════════════
  if(screen==='upload') return(
    <div style={W}>
      <input ref={glossaryFileRef} type="file" accept=".csv,.txt,.xlsx" style={{display:'none'}} onChange={e=>{const f=e.target.files[0];if(f)onGlossaryFile(f)}}/>
      {showHistory&&<HistoryPanel/>}{showGlossaryMgr&&<GlossaryPanel/>}
      <div style={{...SC,alignItems:'stretch',maxWidth:620,margin:'0 auto'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <div>
            <div style={{display:'inline-flex',alignItems:'center',gap:7,background:C.accentBg,border:`1px solid rgba(240,165,0,0.3)`,borderRadius:20,padding:'3px 12px',marginBottom:6}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:C.accent}}/><span style={{fontSize:10,color:C.accent,fontWeight:500,letterSpacing:'0.1em'}}>DocTranslate</span>
            </div>
            <h1 style={{margin:0,fontSize:24,fontWeight:700,letterSpacing:'-0.02em'}}>Translate your document</h1>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{setShowGlossaryMgr(!showGlossaryMgr);setShowHistory(false)}} style={{...BS,padding:'7px 12px',fontSize:12,position:'relative'}}>
              📚 Glossary{glossaryDB.filter(g=>g.srcLang===src&&g.tgtLang===tgt).length>0&&<span style={{position:'absolute',top:-4,right:-4,background:C.accent,color:'#000',borderRadius:'50%',width:16,height:16,fontSize:8,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>{glossaryDB.filter(g=>g.srcLang===src&&g.tgtLang===tgt).length}</span>}
            </button>
            <button onClick={()=>{setShowHistory(!showHistory);setShowGlossaryMgr(false)}} style={{...BS,padding:'7px 12px',fontSize:12,position:'relative'}}>
              🕐 History{history.length>0&&<span style={{position:'absolute',top:-4,right:-4,background:C.info,color:'#000',borderRadius:'50%',width:16,height:16,fontSize:8,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>{history.length}</span>}
            </button>
          </div>
        </div>

        {/* File drop */}
        <div onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);onFile(e.dataTransfer?.files[0])}}
          style={{border:`2px dashed ${drag?C.accent:file?C.success:C.border}`,borderRadius:12,padding:'24px',textAlign:'center',cursor:'pointer',background:drag?C.accentBg:file?'rgba(34,197,94,0.06)':C.surface,transition:'all 0.2s',marginBottom:14}}>
          <input ref={fileRef} type="file" accept=".docx" style={{display:'none'}} onChange={e=>onFile(e.target.files[0])}/>
          <div style={{fontSize:18,marginBottom:5}}>{file?'📄':'⬆'}</div>
          {file?(<>
            <div style={{fontWeight:500,color:C.success,fontSize:14}}>{file.name}</div>
            {docData&&<div style={{display:'flex',gap:12,justifyContent:'center',marginTop:5}}>{[['~'+docData.pageEst+'p',C.muted],['~'+docData.wordCount.toLocaleString()+'w',C.muted],['$'+docData.costEst,C.accent]].map(([v,c],i)=><span key={i} style={{fontSize:12,color:c}}>{v}</span>)}</div>}
            <div style={{fontSize:10,color:C.dim,marginTop:3}}>Click to change</div>
          </>):(<><div style={{fontWeight:500,fontSize:14}}>Drop .docx here or click to browse</div></>)}
        </div>

        {error&&<div style={{padding:'9px 12px',background:C.dangerBg,border:`1px solid ${C.danger}44`,borderRadius:8,fontSize:12,color:C.danger,marginBottom:12}}>⚠ {error}</div>}

        {/* Languages + API key row */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 32px 1fr',gap:8,alignItems:'flex-end',marginBottom:12}}>
          <div><span style={LBL()}>From</span><select value={src} onChange={e=>setSrc(e.target.value)} style={SEL}>{LANGS.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}</select></div>
          <button onClick={()=>{const t=src;setSrc(tgt);setTgt(t)}} style={{...BS,padding:'10px 6px',marginBottom:1,textAlign:'center',fontSize:14}}>⇄</button>
          <div><span style={LBL()}>To</span><select value={tgt} onChange={e=>setTgt(e.target.value)} style={SEL}>{LANGS.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}</select></div>
        </div>
        <div style={{marginBottom:14}}>
          <span style={LBL()}>Claude API key</span>
          <div style={{position:'relative'}}>
            <input type={showKey?'text':'password'} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-ant-api03-..."
              style={{...SEL,paddingRight:38,fontFamily:'monospace',fontSize:12,boxSizing:'border-box'}}/>
            <button onClick={()=>setShowKey(!showKey)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:12,padding:0}}>{showKey?'🙈':'👁'}</button>
          </div>
        </div>

        {/* Settings tabs */}
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:14,overflow:'hidden'}}>
          {/* Tab bar */}
          <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,background:C.bg}}>
            {[['document','Document'],['references',`References${refCount>0?` (${refCount})`:''}`,refCount>0?C.info:null],['glossary','Glossary',glossaryFiles.length>0?C.success:null],['instructions','Instructions',customInstructions||partialSpec?C.accent:null],['privacy','Privacy',privacyMode?C.success:null]].map(([tab,label,dot])=>(
              <div key={tab} onClick={()=>setSettingsTab(tab)} style={{flex:1,padding:'9px 4px',textAlign:'center',cursor:'pointer',background:settingsTab===tab?C.surface:'transparent',borderBottom:settingsTab===tab?`2px solid ${C.accent}`:'2px solid transparent',fontSize:11,fontWeight:settingsTab===tab?500:400,color:settingsTab===tab?C.text:C.dim,position:'relative',transition:'all 0.15s'}}>
                {label}{dot&&<div style={{position:'absolute',top:6,right:6,width:5,height:5,borderRadius:'50%',background:dot}}/>}
              </div>
            ))}
          </div>
          {/* Tab content */}
          <div style={{padding:'14px 16px'}}>
            {settingsTab==='document'&&(
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div>
                  <span style={LBL()}>Translate only (optional)</span>
                  <input value={partialSpec} onChange={e=>setPartialSpec(e.target.value)} placeholder='e.g. "Schedule 1 and 2" or "pages 3-5" or "Annex A"'
                    style={{...SEL,padding:'9px 11px'}}/>
                  <div style={{fontSize:10,color:C.dim,marginTop:4}}>Leave blank to translate the entire document</div>
                </div>
                <div>
                  <span style={LBL()}>Document tone</span>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {TONES.map(([v,l])=><div key={v} onClick={()=>setTone(v)} style={{padding:'5px 10px',borderRadius:7,border:`1.5px solid ${tone===v?C.accent:C.border}`,cursor:'pointer',background:tone===v?C.accentBg:C.card,color:tone===v?C.accent:C.muted,fontSize:11,fontWeight:tone===v?500:400,transition:'all 0.15s'}}>{l}</div>)}
                  </div>
                </div>
                <div>
                  <span style={LBL()}>Document context</span>
                  <textarea value={ctx} onChange={e=>setCtx(e.target.value)} placeholder="e.g. Official OT resolution for bank signatories. Legal register." rows={2}
                    style={{...SEL,padding:'9px 11px',resize:'vertical',lineHeight:1.5,boxSizing:'border-box'}}/>
                </div>
              </div>
            )}
            {settingsTab==='references'&&(
              <div>
                <div style={{fontSize:12,color:C.muted,marginBottom:12}}>Upload up to 3 reference translations. Claude will study their terminology and style before starting.</div>
                {[0,1,2].map(i=>(
                  <div key={i} style={{marginBottom:i<2?10:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',border:`1.5px dashed ${refs[i]?C.info:C.border}`,borderRadius:9,cursor:'pointer',background:refs[i]?C.infoBg:C.surface,transition:'all 0.15s'}}
                      onClick={()=>refRefs[i].current?.click()}>
                      <input ref={refRefs[i]} type="file" accept=".docx" style={{display:'none'}} onChange={e=>onRefFile(i,e.target.files[0])}/>
                      <span style={{fontSize:16}}>{refs[i]?'📎':'+'}</span>
                      <div style={{flex:1}}>
                        {refs[i]?<><div style={{fontSize:12,fontWeight:500,color:C.info}}>{refs[i].name}</div>{refAnalyses[i]?.docType&&<div style={{fontSize:10,color:C.dim,marginTop:1}}>Analyzed: {refAnalyses[i].docType}</div>}</>
                          :<div style={{fontSize:12,color:C.muted}}>Reference {i+1} (optional)</div>}
                      </div>
                      {refs[i]&&<button onClick={e=>{e.stopPropagation();removeRef(i)}} style={{background:'none',border:'none',color:C.dim,cursor:'pointer',fontSize:13,padding:0}}>✕</button>}
                    </div>
                  </div>
                ))}
                {refCount>0&&<div style={{fontSize:10,color:C.info,marginTop:10}}>ℹ Each reference costs ~$0.01 to analyze (Haiku). Terms extracted are merged into your glossary DB.</div>}
              </div>
            )}
            {settingsTab==='glossary'&&(
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                  <div style={{fontSize:12,color:C.muted}}>Persistent glossary for {LANGS.find(l=>l.code===src)?.label} → {LANGS.find(l=>l.code===tgt)?.label}</div>
                  <button onClick={()=>glossaryFileRef.current?.click()} style={{...BP,padding:'6px 12px',fontSize:11}}>+ Upload file</button>
                </div>
                <div style={{...CARD({marginBottom:10})}}>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <div><div style={{fontWeight:500,fontSize:20,color:C.accent}}>{glossaryDB.filter(g=>g.srcLang===src&&g.tgtLang===tgt).length}</div><div style={{fontSize:11,color:C.muted}}>terms in DB</div></div>
                    <div style={{textAlign:'right'}}><div style={{fontWeight:500,fontSize:20,color:C.success}}>{glossaryDB.filter(g=>g.srcLang===src&&g.tgtLang===tgt&&g.confidence>=85).length}</div><div style={{fontSize:11,color:C.muted}}>high confidence</div></div>
                    <div style={{textAlign:'right'}}><div style={{fontWeight:500,fontSize:20}}>{glossaryFiles.length}</div><div style={{fontSize:11,color:C.muted}}>files loaded</div></div>
                  </div>
                </div>
                {glossaryFiles.map((gf,i)=><div key={i} style={{fontSize:11,color:C.success,padding:'4px 0'}}>✓ {gf.name} — {gf.count} terms</div>)}
                <div style={{marginTop:10}}>
                  <span style={LBL()}>Extra glossary (inline)</span>
                  <textarea value={userGlossary} onChange={e=>setUserGlossary(e.target.value)} placeholder="term = translation (one per line)" rows={3}
                    style={{...SEL,padding:'8px 10px',fontFamily:'monospace',fontSize:11,resize:'vertical',boxSizing:'border-box'}}/>
                </div>
                <button onClick={()=>setShowGlossaryMgr(true)} style={{...BS,width:'100%',marginTop:10,fontSize:11,padding:'7px'}}>Open full glossary manager →</button>
              </div>
            )}
            {settingsTab==='instructions'&&(
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div>
                  <span style={LBL()}>Custom instructions</span>
                  <textarea value={customInstructions} onChange={e=>setCustomInstructions(e.target.value)}
                    placeholder={'Examples:\n• "Keep all footnotes in English"\n• "Use informal tone for headings, formal for body"\n• "Translate table cells only, not column headers"\n• "Preserve all bold and italic formatting markers"'}
                    rows={5} style={{...SEL,padding:'9px 11px',resize:'vertical',lineHeight:1.6,fontSize:12,boxSizing:'border-box'}}/>
                  <div style={{fontSize:10,color:C.dim,marginTop:4}}>These instructions are passed directly to Claude on all three passes.</div>
                </div>
                {partialSpec&&<div style={{padding:'8px 12px',background:C.accentBg,border:`1px solid ${C.accent}44`,borderRadius:8,fontSize:12,color:C.accent}}>
                  Partial filter active: "{partialSpec}"
                </div>}
              </div>
            )}
            {settingsTab==='privacy'&&(
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                  <div>
                    <div style={{fontWeight:500,fontSize:13}}>Confidentiality safeguard</div>
                    <div style={{fontSize:11,color:C.dim,marginTop:2}}>Scans for emails, phone numbers, financial amounts, IDs before sending to API</div>
                  </div>
                  <Toggle on={privacyMode} set={setPrivacyMode}/>
                </div>
                {privacyMode&&<>
                  <div style={{fontSize:11,color:C.muted,marginBottom:8}}>When sensitive items are found, you choose:</div>
                  {[{v:'redact',icon:'🔒',t:'Redact & translate',d:'Sensitive items replaced with [PLACEHOLDER] before API call. Restored in the output file.'},{v:'proceed',icon:'⚠',t:'Send as-is',d:'Full document sent to Claude. You acknowledge the content may include sensitive data.'}].map(o=>(
                    <div key={o.v} onClick={()=>setRedactChoice(o.v)} style={{padding:'10px 12px',borderRadius:9,border:`1.5px solid ${redactChoice===o.v?C.accent:C.border}`,cursor:'pointer',background:redactChoice===o.v?C.accentBg:C.surface,marginBottom:8,transition:'all 0.15s'}}>
                      <div style={{fontWeight:500,fontSize:12,color:redactChoice===o.v?C.accent:C.text,marginBottom:3}}>{o.icon} {o.t}</div>
                      <div style={{fontSize:11,color:C.dim,lineHeight:1.45}}>{o.d}</div>
                    </div>
                  ))}
                  <div style={{fontSize:10,color:C.dim,marginTop:4}}>Patterns detected: email addresses, phone numbers, financial amounts ($ figures), ID numbers, GPS coordinates</div>
                </>}
                {!privacyMode&&<div style={{padding:'9px 12px',background:C.warningBg,border:`1px solid ${C.warning}44`,borderRadius:8,fontSize:12,color:C.warning}}>⚠ Privacy scan disabled. All document content will be sent to the Claude API without screening.</div>}
              </div>
            )}
          </div>
        </div>

        <button onClick={handleTranslateClick} disabled={!file||!apiKey||!docData}
          style={{...BP,width:'100%',padding:'13px',fontSize:15,opacity:(!file||!apiKey||!docData)?0.45:1,cursor:(!file||!apiKey||!docData)?'not-allowed':'pointer'}}>
          {refCount>0?`⚡ Analyze ${refCount} reference${refCount>1?'s':''} & translate`:'⚡ Translate everything'}
        </button>
        <div style={{textAlign:'center',color:C.dim,fontSize:10,marginTop:8}}>Haiku × 2 passes + Sonnet × 1 proofread · OT glossary + {glossaryDB.filter(g=>g.srcLang===src&&g.tgtLang===tgt).length} DB terms applied</div>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════
  // PRIVACY REVIEW SCREEN
  // ══════════════════════════════════════════════════════════════════
  if(screen==='privacy-review') return(
    <div style={W}><div style={SC}>
      <div style={{width:'100%',maxWidth:520}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:11,color:C.warning,letterSpacing:'0.12em',fontWeight:500,marginBottom:8}}>CONFIDENTIALITY SCAN</div>
          <h2 style={{margin:'0 0 6px',fontSize:22,fontWeight:700}}>Sensitive content detected</h2>
          <p style={{margin:0,color:C.muted,fontSize:14}}>{sensitiveItems.length} type{sensitiveItems.length>1?'s':''} of sensitive data found in <strong>{file?.name}</strong></p>
        </div>
        {sensitiveItems.map((item,i)=>(
          <div key={i} style={{...CARD({marginBottom:8,borderLeft:`3px solid ${C.warning}`})}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
              <span style={{fontWeight:500,fontSize:13}}>{item.type}</span>
              <span style={{fontSize:11,color:C.muted}}>{item.count} found</span>
            </div>
            <div style={{fontSize:11,color:C.dim}}>{item.examples}</div>
          </div>
        ))}
        <div style={{marginTop:16,marginBottom:16}}>
          {[{v:'redact',icon:'🔒',t:'Redact before sending',d:'Replaces sensitive items with [PLACEHOLDER_1] etc. Originals restored in the downloaded file. API never sees real data.'},{v:'proceed',icon:'⚠',t:'Send full document as-is',d:'Entire document sent to Claude API. Suitable if this is not confidential content.'}].map(o=>(
            <div key={o.v} onClick={()=>setRedactChoice(o.v)} style={{padding:'12px 14px',borderRadius:10,border:`2px solid ${redactChoice===o.v?C.accent:C.border}`,cursor:'pointer',background:redactChoice===o.v?C.accentBg:C.card,marginBottom:8,transition:'all 0.15s'}}>
              <div style={{fontWeight:600,fontSize:13,color:redactChoice===o.v?C.accent:C.text,marginBottom:4}}>{o.icon} {o.t}</div>
              <div style={{fontSize:12,color:C.dim,lineHeight:1.5}}>{o.d}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>setScreen('upload')} style={BS}>← Back</button>
          <button onClick={proceedFromPrivacy} style={{...BP,flex:1,padding:'12px',fontSize:14}}>Continue →</button>
        </div>
      </div>
    </div></div>
  )

  // ══════════════════════════════════════════════════════════════════
  // ANALYZING REF SCREEN
  // ══════════════════════════════════════════════════════════════════
  if(screen==='analyzing-ref') return(
    <div style={W}><div style={SC}>
      <div style={{width:'100%',maxWidth:440,textAlign:'center'}}>
        <div style={{fontSize:11,color:C.info,letterSpacing:'0.12em',fontWeight:500,marginBottom:12}}>ANALYZING REFERENCE {refReviewIdx+1} OF {refs.filter(Boolean).length}</div>
        <div style={{fontWeight:600,fontSize:16,marginBottom:4}}>{refs[refReviewIdx]?.name}</div>
        <div style={{color:C.muted,fontSize:13,marginBottom:28}}>Extracting terminology and translation conventions...</div>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'20px'}}>
          {['Extracting text','Identifying key terms','Analyzing translation style','Building glossary entries'].map((l,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:10,marginBottom:i<3?10:0}}>
              <div style={{width:24,height:24,borderRadius:'50%',background:C.info,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:600,color:'#000',flexShrink:0}}>...</div>
              <span style={{fontSize:13,color:C.muted}}>{l}</span>
            </div>
          ))}
        </div>
        <div style={{marginTop:14,color:C.dim,fontSize:11}}>~$0.01 · takes a few seconds</div>
      </div>
    </div></div>
  )

  // ══════════════════════════════════════════════════════════════════
  // REF REVIEW SCREEN
  // ══════════════════════════════════════════════════════════════════
  if(screen==='ref-review'&&refAnalyses[refReviewIdx]) {
    const analysis=refAnalyses[refReviewIdx]
    const totalRefs=refs.filter(Boolean).length
    return(
      <div style={{...W,padding:'24px 16px'}}><div style={{maxWidth:660,margin:'0 auto'}}>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,color:C.info,letterSpacing:'0.12em',fontWeight:500,marginBottom:7}}>REFERENCE {refReviewIdx+1} OF {totalRefs} — REVIEW FINDINGS</div>
          <h2 style={{margin:'0 0 4px',fontSize:22,fontWeight:700}}>Does this look right?</h2>
          <p style={{margin:0,color:C.muted,fontSize:13}}>{refs[refReviewIdx]?.name}</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          {[['Type',analysis.docType],['Domain',analysis.domain]].map(([k,v])=>(
            <div key={k} style={CARD({padding:'12px 14px'})}><div style={{fontSize:10,color:C.muted,marginBottom:3}}>{k}</div><div style={{fontSize:13,fontWeight:500}}>{v}</div></div>
          ))}
        </div>
        <div style={{...CARD({marginBottom:12,borderLeft:`4px solid ${C.info}`})}}>
          <div style={{fontSize:10,color:C.info,fontWeight:600,marginBottom:5,letterSpacing:'0.08em'}}>STYLE OBSERVED</div>
          <div style={{fontSize:13,lineHeight:1.6}}>{analysis.style}</div>
        </div>
        {analysis.keyTerms?.length>0&&<div style={{...CARD({marginBottom:12})}}>
          <div style={{fontSize:10,color:C.muted,fontWeight:600,letterSpacing:'0.08em',marginBottom:10}}>TERMS EXTRACTED ({analysis.keyTerms.length}) — AUTO-MERGED INTO GLOSSARY DB</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,maxHeight:200,overflowY:'auto'}}>
            {analysis.keyTerms.slice(0,20).map((t,i)=>(
              <div key={i} style={{background:C.surface,borderRadius:6,padding:'6px 9px',display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:11,color:C.dim,flex:1}}>{t.source}</span>
                <span style={{fontSize:10,color:C.border}}>→</span>
                <span style={{fontSize:11,color:C.accent,fontWeight:500,flex:1,textAlign:'right'}}>{t.target}</span>
              </div>
            ))}
          </div>
        </div>}
        <div style={{...CARD({marginBottom:20})}}>
          <span style={LBL({marginBottom:6})}>Notes for translation</span>
          <textarea value={refNotes[refReviewIdx]} onChange={e=>{const n=[...refNotes];n[refReviewIdx]=e.target.value;setRefNotes(n)}} rows={3}
            style={{...SEL,padding:'8px 10px',resize:'vertical',fontSize:12,lineHeight:1.5,boxSizing:'border-box'}}/>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>confirmRef(refReviewIdx)} style={{...BP,flex:1,padding:'12px',fontSize:14}}>
            {refReviewIdx<totalRefs-1?`✓ Confirmed — analyze next →`:`✓ Confirmed — start translating →`}
          </button>
          <button onClick={()=>{const na=[...refAnalyses];na[refReviewIdx]={};setRefAnalyses(na);const nextP=refs.findIndex((r,i)=>r&&!na[i]&&i>refReviewIdx);if(nextP>=0){setRefReviewIdx(nextP);analyzeNextRef(nextP)}else startTranslation(na)}} style={BS}>Skip this ref</button>
        </div>
      </div></div>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  // TRANSLATING SCREEN
  // ══════════════════════════════════════════════════════════════════
  if(screen==='translating') return(
    <div style={W}><div style={SC}>
      <div style={{width:'100%',maxWidth:480}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:11,color:C.accent,letterSpacing:'0.12em',fontWeight:500,marginBottom:8}}>TRANSLATING</div>
          <div style={{fontWeight:600,fontSize:16}}>{file?.name}</div>
          <div style={{color:C.muted,fontSize:12,marginTop:4,display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
            <span>{LANGS.find(l=>l.code===src)?.label} → {LANGS.find(l=>l.code===tgt)?.label}</span>
            {partialSpec&&<span style={{color:C.accent}}>· "{partialSpec}"</span>}
            {refAnalyses.filter(Boolean).filter(a=>a?.docType).length>0&&<span style={{color:C.info}}>· {refAnalyses.filter(Boolean).filter(a=>a?.docType).length} ref active</span>}
            {restoreMap&&Object.keys(restoreMap).length>0&&<span style={{color:C.success}}>· Redacted</span>}
          </div>
        </div>
        {PASSES_META.map((p,i)=>{const done=donePasses.includes(i),active=passIdx===i&&!done;return(
          <div key={i} style={{background:C.surface,border:`1px solid ${done?C.success:active?C.accent:C.border}`,borderRadius:12,padding:'14px 16px',marginBottom:9,opacity:i>passIdx?0.35:1,transition:'all 0.3s'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:active?11:0}}>
              <div style={{width:28,height:28,borderRadius:'50%',background:done?C.success:active?C.accent:C.border,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:done||active?'#000':C.muted,transition:'background 0.25s'}}>{done?'✓':i+1}</div>
              <div style={{flex:1}}><div style={{fontWeight:500,fontSize:13,color:done?C.success:active?C.accent:C.muted}}>{p.label}</div><div style={{fontSize:10,color:C.dim,marginTop:1}}>{p.desc} · {p.model}</div></div>
              {done&&<span style={{fontSize:10,color:C.success}}>Done</span>}
              {active&&<span style={{fontSize:11,color:C.accent,fontFamily:'monospace'}}>{Math.round(prog)}%</span>}
            </div>
            {active&&<div style={{height:2,background:C.border,borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',background:C.accent,width:`${prog}%`,transition:'width 0.1s'}}/></div>}
          </div>
        )})}
        <div style={{textAlign:'center',marginTop:12,color:C.dim,fontSize:11}}>{donePasses.length<3?'Do not close this tab':'Opening editor...'}</div>
      </div>
    </div></div>
  )

  // ══════════════════════════════════════════════════════════════════
  // EDITOR SCREEN
  // ══════════════════════════════════════════════════════════════════
  if(screen==='editor') return(
    <div style={{...W,display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden'}}>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'9px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:12,fontWeight:600}}>📄 {file?.name}</span>
          <div style={{display:'flex',gap:5}}>
            {[[flagged,C.accent,`${flagged}▲`],[edited,C.edited,`${edited} edited`],[confirmed,C.success,`${confirmed}✓`]].map(([count,color,label])=>count>0&&(
              <div key={label} style={{display:'flex',alignItems:'center',gap:3,padding:'2px 8px',background:color+'18',border:`1px solid ${color}44`,borderRadius:5}}><span style={{fontSize:10,color}}>{label}</span></div>
            ))}
          </div>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={confirmAllSafe} style={{...BS,padding:'5px 10px',fontSize:11}}>Confirm safe</button>
          <button onClick={doDownload} style={{...BP,padding:'6px 14px',fontSize:12}}>Download ↓</button>
        </div>
      </div>
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={{flex:1,overflowY:'auto',padding:'12px 14px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
            <div style={{fontSize:9,color:C.dim,fontWeight:500,letterSpacing:'0.12em',textTransform:'uppercase',padding:'4px 8px',background:C.surface,borderRadius:5,textAlign:'center',border:`1px solid ${C.border}`}}>Original</div>
            <div style={{fontSize:9,color:C.accent,fontWeight:500,letterSpacing:'0.12em',textTransform:'uppercase',padding:'4px 8px',background:C.accentBg,borderRadius:5,textAlign:'center',border:`1px solid rgba(240,165,0,0.3)`}}>Translation</div>
          </div>
          {segs.map(seg=>{
            const isEditing=editingId===seg.id,hasActiveFlag=activeSegId===seg.id&&activeFlagWord
            const sColor=statusColor[seg.status]||C.border,activeFlag=seg.flags.find(f=>f.word===activeFlagWord)
            return(
              <div key={seg.id} style={{marginBottom:7}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',background:C.card,border:`1px solid ${hasActiveFlag?C.accent:sColor}`,borderRadius:hasActiveFlag?'10px 10px 0 0':10,overflow:'hidden',transition:'border-color 0.2s'}}>
                  <div style={{padding:'9px 11px',borderRight:`1px solid ${C.border}`,borderLeft:`3px solid ${sColor}`}}><div style={{fontSize:11,color:C.dim,lineHeight:1.6}}>{seg.original}</div></div>
                  <div style={{padding:'9px 11px'}}>
                    {isEditing?(
                      <div><textarea ref={editRef} value={editText} onChange={e=>setEditText(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setEditingId(null);if(e.key==='Enter'&&e.metaKey)saveEdit(seg.id)}}
                        style={{width:'100%',minHeight:54,padding:'6px 8px',background:C.surface,border:`1px solid ${C.accent}`,borderRadius:6,color:C.text,fontSize:11,fontFamily:'inherit',outline:'none',resize:'vertical',lineHeight:1.6,boxSizing:'border-box'}}/>
                        <div style={{display:'flex',gap:5,marginTop:5}}>
                          <button onClick={()=>saveEdit(seg.id)} style={{...BP,padding:'3px 10px',fontSize:10}}>Save</button>
                          <button onClick={()=>setEditingId(null)} style={{...BS,padding:'3px 8px',fontSize:10}}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <div style={{display:'flex',alignItems:'flex-start',gap:5}}>
                        <div style={{flex:1,fontSize:11,color:C.text,lineHeight:1.6}}>{seg.flags.length>0?renderFlagged(seg):seg.translated}</div>
                        <div style={{display:'flex',flexDirection:'column',gap:3,flexShrink:0}}>
                          {seg.status!=='confirmed'&&<button onClick={e=>{e.stopPropagation();setEditingId(seg.id);setEditText(seg.translated);setActiveFlagWord(null);setTimeout(()=>editRef.current?.focus(),50)}} style={{width:20,height:20,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,color:C.muted,fontSize:10,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✎</button>}
                          {seg.status==='normal'&&!seg.flags.length&&<button onClick={e=>{e.stopPropagation();confirmSeg(seg.id)}} style={{width:20,height:20,background:C.successBg,border:`1px solid ${C.success}44`,borderRadius:4,color:C.success,fontSize:10,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✓</button>}
                          {seg.status==='confirmed'&&<div style={{width:20,height:20,background:C.successBg,border:`1px solid ${C.success}44`,borderRadius:4,color:C.success,fontSize:10,display:'flex',alignItems:'center',justifyContent:'center'}}>✓</div>}
                          {seg.status==='edited'&&<div style={{fontSize:7,padding:'1px 3px',background:C.editedBg,border:`1px solid ${C.edited}44`,borderRadius:3,color:C.edited}}>ed</div>}
                          {seg.flags.length>0&&<div style={{fontSize:7,padding:'1px 3px',background:C.accentBg,border:`1px solid ${C.accent}44`,borderRadius:3,color:C.accent}}>{seg.flags.length}▲</div>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {hasActiveFlag&&activeFlag&&(
                  <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.accent}`,borderTop:'none',borderRadius:'0 0 10px 10px',padding:'11px 13px'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:9}}>
                      <span style={{fontSize:10,color:C.accent,fontWeight:600}}>OPTIONS FOR "{activeFlagWord}"</span>
                      <button onClick={()=>{setActiveFlagWord(null);setActiveSegId(null)}} style={{background:'none',border:'none',color:C.dim,cursor:'pointer',fontSize:12,padding:0}}>✕</button>
                    </div>
                    <div style={{display:'flex',gap:7,marginBottom:9}}>
                      {activeFlag.options.filter(o=>o.text).map((opt,oi)=>(
                        <div key={oi} onClick={()=>applyOption(seg.id,activeFlagWord,opt)} style={{flex:1,padding:'9px 11px',borderRadius:8,border:`1.5px solid ${oi===0?C.accent:C.border}`,cursor:'pointer',background:oi===0?C.accentBg:C.card,transition:'all 0.15s'}}>
                          <div style={{fontWeight:600,fontSize:11,color:oi===0?C.accent:C.text,marginBottom:3}}>{opt.text}</div>
                          <div style={{fontSize:10,color:C.dim,marginBottom:5}}>{opt.note}</div>
                          <div style={{height:2,background:C.border,borderRadius:1}}><div style={{height:'100%',background:oi===0?C.accent:C.info,width:`${opt.confidence}%`}}/></div>
                        </div>
                      ))}
                    </div>
                    <div style={{display:'flex',gap:7}}>
                      <input value={customInput} onChange={e=>setCustomInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&customInput.trim())applyOption(seg.id,activeFlagWord,{text:customInput.trim(),note:'Custom edit',confidence:100})}} placeholder={`Type your own for "${activeFlagWord}"...`}
                        style={{flex:1,padding:'6px 10px',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:11,fontFamily:'inherit',outline:'none'}}/>
                      {customInput.trim()&&<button onClick={()=>applyOption(seg.id,activeFlagWord,{text:customInput.trim(),note:'Custom edit',confidence:100})} style={{...BP,padding:'6px 12px',fontSize:11}}>Apply</button>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {showSidebar&&(
          <div style={{width:220,background:C.surface,borderLeft:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0}}>
            <div style={{padding:'10px 12px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:12,fontWeight:500}}>Session</span>{learned.length>0&&<span style={{fontSize:9,padding:'1px 5px',background:C.accentBg,border:`1px solid ${C.accent}44`,borderRadius:9,color:C.accent}}>{learned.length}</span>}</div>
              <button onClick={()=>setShowSidebar(false)} style={{background:'none',border:'none',color:C.dim,cursor:'pointer',fontSize:12,padding:0}}>✕</button>
            </div>
            {refAnalyses.filter(a=>a?.docType).length>0&&<div style={{padding:'7px 11px',background:C.infoBg,borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:9,color:C.info,fontWeight:600,marginBottom:2}}>REFERENCES ACTIVE</div>{refs.filter(Boolean).map((r,i)=>refAnalyses[i]?.docType&&<div key={i} style={{fontSize:10,color:C.dim}}>{r.name}</div>)}</div>}
            {restoreMap&&Object.keys(restoreMap).length>0&&<div style={{padding:'7px 11px',background:C.successBg,borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:9,color:C.success,fontWeight:600}}>✓ {Object.keys(restoreMap).length} ITEMS REDACTED</div><div style={{fontSize:10,color:C.dim}}>Restored in output</div></div>}
            <div style={{flex:1,overflowY:'auto',padding:'9px 10px'}}>
              {learned.length===0?<div style={{textAlign:'center',padding:'16px 8px'}}><div style={{fontSize:18,marginBottom:7}}>📚</div><div style={{fontSize:10,color:C.dim,lineHeight:1.55}}>Click <span style={{color:C.accent}}>amber ▲ words</span> to review. Choices are saved to your glossary DB.</div></div>:
                learned.map((t,i)=>(
                  <div key={i} style={{padding:'7px 9px',background:C.card,borderRadius:7,marginBottom:5,borderLeft:`3px solid ${C.accent}`}}>
                    <div style={{fontSize:10,color:C.muted}}>"{t.from}"</div>
                    <div style={{fontSize:10,color:C.dim,margin:'2px 0'}}>→</div>
                    <div style={{fontSize:11,fontWeight:500,color:C.accent}}>"{t.to}"</div>
                  </div>
                ))}
            </div>
            <div style={{padding:'10px 11px',borderTop:`1px solid ${C.border}`}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:C.muted,marginBottom:5}}><span>Glossary DB</span><span style={{color:C.accent}}>{glossaryDB.filter(g=>g.srcLang===src&&g.tgtLang===tgt).length} terms</span></div>
              <div style={{height:2,background:C.border,borderRadius:1,overflow:'hidden',marginBottom:5}}><div style={{height:'100%',background:C.success,width:`${segs.length?(confirmed/segs.length*100):0}%`,transition:'width 0.3s'}}/></div>
              <div style={{fontSize:10,color:C.muted}}>{confirmed}/{segs.length} confirmed{flagged>0&&<span style={{color:C.accent}}> · {flagged} flagged</span>}</div>
            </div>
          </div>
        )}
        {!showSidebar&&<button onClick={()=>setShowSidebar(true)} style={{position:'fixed',right:12,bottom:55,padding:'7px 11px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,fontSize:11,cursor:'pointer',fontFamily:'inherit',zIndex:20,display:'flex',alignItems:'center',gap:5}}>📚{learned.length>0&&<span style={{background:C.accent,color:'#000',borderRadius:'50%',width:14,height:14,fontSize:8,display:'inline-flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>{learned.length}</span>}</button>}
      </div>
      {toast&&<div style={{position:'fixed',bottom:16,left:'50%',transform:'translateX(-50%)',background:C.success,color:'#000',padding:'7px 16px',borderRadius:7,fontSize:11,fontWeight:500,zIndex:100,whiteSpace:'nowrap',pointerEvents:'none'}}>✓ {toast}</div>}
    </div>
  )

  return(
    <div style={W}><div style={SC}>
      <div style={{width:'100%',maxWidth:400,textAlign:'center'}}>
        <div style={{fontSize:32,marginBottom:14}}>✓</div>
        <h2 style={{margin:'0 0 6px',fontSize:20,fontWeight:700}}>Ready to download</h2>
        <p style={{color:C.muted,fontSize:13,margin:'0 0 20px'}}>{learned.length} terms learned · {edited} edited</p>
        <button onClick={doDownload} style={{...BP,width:'100%',padding:'12px',fontSize:14,marginBottom:8}}>↓ Download translated .docx</button>
        <button onClick={()=>{setScreen('upload');setFile(null);setDocData(null);setSegs([]);setLearned([]);setRefs([null,null,null]);setRefAnalyses([null,null,null]);setRestoreMap(null);setDocData(prev=>prev?{...prev,_redactedParagraphs:null,restoreMap:null}:null);busyRef.current=false}} style={{...BS,width:'100%',padding:'10px',fontSize:13}}>Translate another</button>
      </div>
    </div></div>
  )
}
