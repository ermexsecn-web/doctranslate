import { useState, useEffect, useRef } from "react";

const C = {
  bg:'#0B0F1A', surface:'#131929', card:'#1A2235', border:'#243046',
  accent:'#F0A500', accentBg:'rgba(240,165,0,0.09)',
  text:'#EEF2FF', muted:'#8896B3', dim:'#4A5870',
  success:'#22C55E', successBg:'rgba(34,197,94,0.08)',
  info:'#60A5FA', danger:'#F87171',
  edited:'#A78BFA', editedBg:'rgba(167,139,250,0.08)',
};

const PASSES = [
  {label:'Pass 1 — Initial translation', desc:'Full document converted from English to Mongolian'},
  {label:'Pass 2 — Terminology & consistency', desc:'Glossary enforced, repeated terms unified throughout'},
  {label:'Pass 3 — Proofread & flag', desc:'Ambiguous terms flagged for your review'},
];

const mkSegs = () => [
  {id:'s1', type:'heading',
   original:'OYU TOLGOI LLC\nRESOLUTION OF CHIEF EXECUTIVE OFFICER',
   translated:'ОЮУ ТОЛГОЙ ХХК-ИЙН\nГҮЙЦЭТГЭХ ЗАХИРЛЫН ТУШААЛ',
   status:'confirmed', flags:[]},
  {id:'s2', type:'meta',
   original:'Date: 2026.04.24   Ref. A/87   Ulaanbaatar',
   translated:'Огноо: 2026.04.24   Дугаар A/87   Улаанбаатар',
   status:'confirmed', flags:[]},
  {id:'s3', type:'sub',
   original:'Oyu Tolgoi LLC Letter of Credit Authorization and Signatories',
   translated:'Оюу Толгой ХХК-ийн нэр дээр аккредитиваар төлбөр тооцоо хийх, гарын үсэг зурах эрх олгох тухай',
   status:'confirmed', flags:[]},
  {id:'s4', type:'body',
   original:'Effective on April 24th, 2026, this Resolution of Chief Executive Officer serves to formalize authorization, and the appointment of signatories in Singapore and India.',
   translated:'2026 оны 4 дүгээр сарын 24-ний өдрөөс эхлэн мөрдөгдөх энэхүү Гүйцэтгэх захирлын тушаал нь Сингапур болон Энэтхэг дэх гарын үсэг зурах эрхийг баталгаажуулж, бүрэн эрхийг батлах зорилгоор гаргагдлаа.',
   status:'flagged', flags:[
     {word:'баталгаажуулж', options:[
       {text:'баталгаажуулж', note:'To confirm/affirm — matches DRA-87 style', confidence:88, ref:true},
       {text:'албажуулж', note:'To formalize officially — stricter register', confidence:74},
       {text:'тогтоож', note:'To establish/fix — slightly weaker nuance', confidence:61},
     ]},
     {word:'бүрэн эрхийг', options:[
       {text:'бүрэн эрхийг', note:'Full authority/powers — used in DRA-87', confidence:91, ref:true},
       {text:'зөвшөөрлийг', note:'Authorization/permission — more common', confidence:78},
       {text:'эрх мэдлийг', note:'Authority — broader legal meaning', confidence:65},
     ]},
   ]},
  {id:'s5', type:'list',
   original:'Documentary credits;  Bill of exchange;  Bank Form including Electronic Banking Service;',
   translated:'Баримтат аккредитив;  Вексель;  Цахим банкны үйлчилгээний маягт гэх мэт банкны маягт;',
   status:'confirmed', flags:[]},
  {id:'s6', type:'body',
   original:'Negotiating payment against Documents opened by customers with Oyu Tolgoi LLC as beneficiary.',
   translated:'Оюу Толгой ХХК-ийн харилцагчдын нээсэн Баримтад үндэслэн төлбөр хүлээн авагчийн хувиар төлбөрийг тохиролцох.',
   status:'flagged', flags:[
     {word:'тохиролцох', options:[
       {text:'тохиролцох', note:'To negotiate/agree on — established in DRA-87', confidence:86, ref:true},
       {text:'зохицуулах', note:'To arrange/coordinate — more administrative', confidence:70},
       {text:'хэлэлцэх', note:'To discuss/deliberate — dialogue-focused', confidence:58},
     ]},
   ]},
  {id:'s7', type:'body',
   original:'Oyu Tolgoi LLC requires two (2) signatures on Documents in fields 1 to 4 and hereby authorizes one (1) from Group A and one (1) from Group B.',
   translated:'Оюу Толгой ХХК-ийн зүгээс 1-ээс 4 хүртэл дугаар бүхий Баримтууд дээр хоёр (2) гарын үсэг шаардагдах бөгөөд А группээс нэг (1), Б группээс нэг (1) хүн тус тус гарын үсэг зурах эрхтэй.',
   status:'normal', flags:[]},
  {id:'s8', type:'body',
   original:'This Resolution replaces and supersedes Resolution No. A/10 dated March 15th, 2023.',
   translated:'Энэхүү Тушаал нь 2023 оны 3 дугаар сарын 15-ний өдрийн A/10 дугаартай тушаалыг орлож, хүчингүй болгоно.',
   status:'flagged', flags:[
     {word:'хүчингүй болгоно', options:[
       {text:'хүчингүй болгоно', note:'To void/nullify — standard legal Mongolian', confidence:92, ref:true},
       {text:'хүчин төгөлдөр бус болгоно', note:'To render invalid — more explicit legal form', confidence:78},
       {text:'цуцалж байна', note:'To cancel/revoke — direct but less formal', confidence:62},
     ]},
   ]},
];

export default function DocTranslate() {
  const [screen, setScreen] = useState('upload');
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [segs, setSegs] = useState(mkSegs());
  const [passIdx, setPassIdx] = useState(0);
  const [prog, setProg] = useState(0);
  const [donePasses, setDonePasses] = useState([]);
  const [busy, setBusy] = useState(false);
  const [activeSegId, setActiveSegId] = useState(null);
  const [activeFlagWord, setActiveFlagWord] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [learned, setLearned] = useState([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [toast, setToast] = useState(null);
  const fileRef = useRef();
  const editRef = useRef();

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  // Pass animation
  useEffect(() => {
    if (screen !== 'translating' || busy) return;
    setBusy(true);
    let p = 0; setPassIdx(0); setProg(0); setDonePasses([]);
    const run = () => {
      if (p >= PASSES.length) { setTimeout(() => { setBusy(false); setScreen('editor'); }, 500); return; }
      setPassIdx(p); setProg(0);
      let v = 0;
      const iv = setInterval(() => {
        v += Math.random() * 5 + 1.5;
        if (v >= 100) { clearInterval(iv); setProg(100); setTimeout(() => { setDonePasses(d => [...d, p]); p++; setTimeout(run, 320); }, 380); }
        else setProg(v);
      }, 75);
    };
    setTimeout(run, 400);
  }, [screen]);

  const applyOption = (segId, flagWord, opt) => {
    setSegs(prev => prev.map(s => {
      if (s.id !== segId) return s;
      const newText = s.translated.replace(flagWord, opt.text);
      const newFlags = s.flags.filter(f => f.word !== flagWord);
      if (opt.text !== flagWord) {
        setLearned(l => [...l, { from: flagWord, to: opt.text, note: opt.note }]);
        showToast(`Saved to glossary: "${flagWord}" → "${opt.text}"`);
      } else {
        showToast(`Confirmed: "${flagWord}" kept as-is`);
      }
      return { ...s, translated: newText, flags: newFlags, status: newFlags.length === 0 ? (opt.text !== flagWord ? 'edited' : 'confirmed') : 'flagged' };
    }));
    setActiveFlagWord(null); setActiveSegId(null); setCustomInput('');
  };

  const saveEdit = (segId) => {
    const seg = segs.find(s => s.id === segId);
    if (seg && editText.trim() && editText !== seg.translated) {
      setSegs(prev => prev.map(s => s.id === segId ? { ...s, translated: editText, status: 'edited', flags: [] } : s));
      showToast('Edit saved');
    }
    setEditingId(null);
  };

  const confirmSeg = (segId) => setSegs(prev => prev.map(s => s.id === segId ? { ...s, status: 'confirmed' } : s));
  const confirmAllSafe = () => setSegs(prev => prev.map(s => s.status === 'normal' ? { ...s, status: 'confirmed' } : s));

  const confirmed = segs.filter(s => s.status === 'confirmed').length;
  const flagged = segs.filter(s => s.status === 'flagged').length;
  const edited = segs.filter(s => s.status === 'edited').length;

  const statusColor = { confirmed: C.success, flagged: C.accent, edited: C.edited, normal: C.border };

  const renderFlagged = (seg) => {
    if (!seg.flags.length) return <span>{seg.translated}</span>;
    let parts = [{ t: 'text', v: seg.translated }];
    for (const flag of seg.flags) {
      const next = [];
      for (const part of parts) {
        if (part.t !== 'text') { next.push(part); continue; }
        const i = part.v.indexOf(flag.word);
        if (i === -1) { next.push(part); continue; }
        if (i > 0) next.push({ t: 'text', v: part.v.slice(0, i) });
        next.push({ t: 'flag', v: flag.word, flag });
        const rest = part.v.slice(i + flag.word.length);
        if (rest) next.push({ t: 'text', v: rest });
      }
      parts = next;
    }
    return (
      <span>
        {parts.map((part, i) => {
          if (part.t === 'text') return <span key={i}>{part.v}</span>;
          const active = activeFlagWord === part.v && activeSegId === seg.id;
          return (
            <span key={i} onClick={e => { e.stopPropagation(); setActiveSegId(seg.id); setActiveFlagWord(active ? null : part.v); setCustomInput(''); }}
              style={{ background: active ? 'rgba(240,165,0,0.25)' : 'rgba(240,165,0,0.12)', borderBottom: `2px solid ${active ? C.accent : 'rgba(240,165,0,0.55)'}`, cursor: 'pointer', padding: '1px 2px', borderRadius: 3, fontWeight: active ? 500 : 400, transition: 'all 0.15s' }}>
              {part.v}<sup style={{ fontSize: 8, color: C.accent, marginLeft: 1 }}>▲</sup>
            </span>
          );
        })}
      </span>
    );
  };

  const W = { fontFamily: "'system-ui',-apple-system,'Segoe UI',sans-serif", background: C.bg, color: C.text, minHeight: '100vh' };

  // ── UPLOAD ────────────────────────────────────────────────────────────────────
  if (screen === 'upload') return (
    <div style={W}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.accentBg, border: `1px solid rgba(240,165,0,0.3)`, borderRadius: 20, padding: '4px 14px', marginBottom: 14 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent }} />
            <span style={{ fontSize: 11, color: C.accent, fontWeight: 500, letterSpacing: '0.1em' }}>DocTranslate · v2</span>
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Translate your document</h1>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>One click. Multi-pass quality. Fully editable results.</p>
        </div>

        <div style={{ width: '100%', maxWidth: 520 }}>
          <div onClick={() => fileRef.current?.click()} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer?.files[0]; if (f) setFile(f); }}
            style={{ border: `2px dashed ${drag ? C.accent : file ? C.success : C.border}`, borderRadius: 14, padding: '32px 24px', textAlign: 'center', cursor: 'pointer', background: drag ? C.accentBg : file ? 'rgba(34,197,94,0.06)' : C.surface, transition: 'all 0.2s', marginBottom: 18 }}>
            <input ref={fileRef} type="file" accept=".docx" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
            <div style={{ fontSize: 22, marginBottom: 7 }}>{file ? '📄' : '⬆'}</div>
            {file ? (
              <>
                <div style={{ fontWeight: 500, color: C.success, fontSize: 15 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB · Click to change</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 500, fontSize: 15 }}>Drop your .docx here</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>or click to browse</div>
              </>
            )}
          </div>

          {/* ⚡ ONE-CLICK PRIMARY ACTION */}
          <button onClick={() => setScreen('translating')}
            style={{ width: '100%', padding: '15px', background: C.accent, color: '#000', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10, letterSpacing: '0.01em' }}>
            ⚡ Translate everything
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ fontSize: 11, color: C.dim }}>or</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          <button style={{ width: '100%', padding: '11px', background: C.surface, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            Configure options →
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 20 }}>
            {[['⚡', 'One click', '3-pass translate + proofread in one go'], ['✎', 'Segment editor', 'Edit word by word after translation'], ['📚', 'Learns from you', 'Builds your glossary as you review']].map(([icon, title, sub]) => (
              <div key={title} style={{ textAlign: 'center', padding: '12px 8px', background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 18, marginBottom: 5 }}>{icon}</div>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.4 }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── TRANSLATING ───────────────────────────────────────────────────────────────
  if (screen === 'translating') return (
    <div style={W}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: 490 }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <div style={{ fontSize: 11, color: C.accent, letterSpacing: '0.12em', fontWeight: 500, marginBottom: 9 }}>TRANSLATING</div>
            <div style={{ fontWeight: 600, fontSize: 17 }}>{file?.name || 'OT_Draft_Resolution.docx'}</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 5 }}>English → Mongolian · 3-pass quality mode</div>
          </div>
          {PASSES.map((p, i) => {
            const done = donePasses.includes(i);
            const active = passIdx === i && !done;
            return (
              <div key={i} style={{ background: C.surface, border: `1px solid ${done ? C.success : active ? C.accent : C.border}`, borderRadius: 13, padding: '15px 18px', marginBottom: 10, opacity: i > passIdx ? 0.35 : 1, transition: 'all 0.3s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: active ? 12 : 0 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: done ? C.success : active ? C.accent : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: done || active ? '#000' : C.muted, transition: 'background 0.25s' }}>{done ? '✓' : i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: done ? C.success : active ? C.accent : C.muted }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{p.desc}</div>
                  </div>
                  {done && <span style={{ fontSize: 11, color: C.success }}>Complete</span>}
                  {active && <span style={{ fontSize: 12, color: C.accent, fontFamily: 'monospace' }}>{Math.round(prog)}%</span>}
                </div>
                {active && <div style={{ height: 3, background: C.border, borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', background: C.accent, width: `${prog}%`, transition: 'width 0.07s' }} /></div>}
              </div>
            );
          })}
          <div style={{ textAlign: 'center', marginTop: 14, color: C.dim, fontSize: 12 }}>
            {donePasses.length < 3 ? 'Do not close this tab' : 'Opening segment editor...'}
          </div>
        </div>
      </div>
    </div>
  );

  // ── EDITOR ────────────────────────────────────────────────────────────────────
  if (screen === 'editor') return (
    <div style={{ ...W, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Sticky header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>📄 {file?.name || 'OT_Draft_Resolution.docx'}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[[flagged, C.accent, `${flagged} flagged`], [edited, C.edited, `${edited} edited`], [confirmed, C.success, `${confirmed} confirmed`]].map(([count, color, label]) => count > 0 && (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: color + '18', border: `1px solid ${color}44`, borderRadius: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: 11, color }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <button onClick={confirmAllSafe} style={{ padding: '6px 12px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Confirm safe segments</button>
          <button onClick={() => setScreen('done')} style={{ padding: '7px 15px', background: C.accent, border: 'none', borderRadius: 7, color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Download ↓</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Segment list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12, position: 'sticky', top: 0, zIndex: 5 }}>
            <div style={{ fontSize: 10, color: C.dim, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', background: C.surface, borderRadius: 6, textAlign: 'center', border: `1px solid ${C.border}` }}>Original — English</div>
            <div style={{ fontSize: 10, color: C.accent, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', background: C.accentBg, borderRadius: 6, textAlign: 'center', border: `1px solid rgba(240,165,0,0.3)` }}>Translation — Mongolian</div>
          </div>

          {segs.map(seg => {
            const isEditing = editingId === seg.id;
            const hasActiveFlag = activeSegId === seg.id && activeFlagWord;
            const sColor = statusColor[seg.status] || C.border;
            const activeFlag = seg.flags.find(f => f.word === activeFlagWord);

            return (
              <div key={seg.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, background: C.card, border: `1px solid ${hasActiveFlag ? C.accent : sColor}`, borderRadius: hasActiveFlag ? '11px 11px 0 0' : 11, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                  {/* Original */}
                  <div style={{ padding: '11px 13px', borderRight: `1px solid ${C.border}`, borderLeft: `3px solid ${sColor}`, transition: 'border-color 0.2s' }}>
                    <div style={{ fontSize: seg.type === 'heading' ? 12 : 11, color: C.dim, lineHeight: 1.65, whiteSpace: seg.type === 'heading' ? 'pre-line' : 'normal', textAlign: seg.type === 'heading' || seg.type === 'meta' ? 'center' : 'left', fontFamily: seg.type === 'meta' ? 'monospace' : 'inherit' }}>{seg.original}</div>
                  </div>

                  {/* Translated */}
                  <div style={{ padding: '11px 13px' }}>
                    {isEditing ? (
                      <div>
                        <textarea ref={editRef} value={editText} onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Escape') setEditingId(null); if (e.key === 'Enter' && e.metaKey) saveEdit(seg.id); }}
                          style={{ width: '100%', minHeight: 60, padding: '7px 9px', background: C.surface, border: `1px solid ${C.accent}`, borderRadius: 7, color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                          <button onClick={() => saveEdit(seg.id)} style={{ padding: '4px 12px', background: C.accent, border: 'none', borderRadius: 6, color: '#000', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{ padding: '4px 10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                          <span style={{ fontSize: 10, color: C.dim, alignSelf: 'center', marginLeft: 4 }}>⌘↵ to save</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                        <div style={{ flex: 1, fontSize: seg.type === 'heading' ? 12 : 11, color: C.text, lineHeight: 1.65, whiteSpace: seg.type === 'heading' ? 'pre-line' : 'normal', textAlign: seg.type === 'heading' || seg.type === 'meta' ? 'center' : 'left', fontFamily: seg.type === 'meta' ? 'monospace' : 'inherit' }}>
                          {seg.flags.length > 0 ? renderFlagged(seg) : seg.translated}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                          {seg.status !== 'confirmed' && (
                            <button onClick={e => { e.stopPropagation(); setEditingId(seg.id); setEditText(seg.translated); setActiveFlagWord(null); setTimeout(() => editRef.current?.focus(), 50); }}
                              title="Edit manually" style={{ width: 22, height: 22, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>
                          )}
                          {seg.status === 'normal' && !seg.flags.length && (
                            <button onClick={e => { e.stopPropagation(); confirmSeg(seg.id); }} title="Confirm"
                              style={{ width: 22, height: 22, background: C.successBg, border: `1px solid ${C.success}44`, borderRadius: 5, color: C.success, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</button>
                          )}
                          {seg.status === 'confirmed' && (
                            <div style={{ width: 22, height: 22, background: C.successBg, border: `1px solid ${C.success}44`, borderRadius: 5, color: C.success, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
                          )}
                          {seg.status === 'edited' && (
                            <div style={{ fontSize: 8, padding: '2px 4px', background: C.editedBg, border: `1px solid ${C.edited}44`, borderRadius: 4, color: C.edited, textAlign: 'center', lineHeight: 1.3 }}>edited</div>
                          )}
                          {seg.flags.length > 0 && (
                            <div style={{ fontSize: 8, padding: '2px 4px', background: C.accentBg, border: `1px solid ${C.accent}44`, borderRadius: 4, color: C.accent, textAlign: 'center', lineHeight: 1.3 }}>{seg.flags.length} flag{seg.flags.length > 1 ? 's' : ''}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Flag options panel — inline, directly below segment */}
                {hasActiveFlag && activeFlag && (
                  <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.accent}`, borderTop: 'none', borderRadius: '0 0 11px 11px', padding: '14px 15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: C.accent, fontWeight: 600, letterSpacing: '0.1em' }}>TRANSLATION OPTIONS</span>
                        <span style={{ fontSize: 11, color: C.dim }}>for <span style={{ color: C.accent, fontWeight: 500 }}>"{activeFlagWord}"</span></span>
                      </div>
                      <button onClick={() => { setActiveFlagWord(null); setActiveSegId(null); }} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeFlag.options.length}, 1fr)`, gap: 8, marginBottom: 10 }}>
                      {activeFlag.options.map((opt, oi) => (
                        <div key={oi} onClick={() => applyOption(seg.id, activeFlagWord, opt)}
                          style={{ padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${oi === 0 ? C.accent : C.border}`, cursor: 'pointer', background: oi === 0 ? C.accentBg : C.card, transition: 'all 0.15s' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 12, color: oi === 0 ? C.accent : C.text, lineHeight: 1.3 }}>{opt.text}</span>
                            {opt.ref && <span style={{ fontSize: 8, padding: '1px 5px', background: C.accentBg, border: `1px solid ${C.accent}44`, borderRadius: 3, color: C.accent, fontWeight: 600, flexShrink: 0, marginLeft: 4 }}>DRA-87</span>}
                          </div>
                          <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.45, marginBottom: 7 }}>{opt.note}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ flex: 1, height: 2, background: C.border, borderRadius: 2 }}>
                              <div style={{ height: '100%', borderRadius: 2, background: oi === 0 ? C.accent : oi === 1 ? C.info : C.muted, width: `${opt.confidence}%` }} />
                            </div>
                            <span style={{ fontSize: 9, color: C.dim, fontFamily: 'monospace' }}>{opt.confidence}%</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={customInput} onChange={e => setCustomInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && customInput.trim()) { applyOption(seg.id, activeFlagWord, { text: customInput.trim(), note: 'Custom edit', confidence: 100 }); } }}
                        placeholder={`Or type your own translation for "${activeFlagWord}"...`}
                        style={{ flex: 1, padding: '7px 11px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, fontSize: 11, fontFamily: 'inherit', outline: 'none' }} />
                      {customInput.trim() && (
                        <button onClick={() => applyOption(seg.id, activeFlagWord, { text: customInput.trim(), note: 'Custom edit', confidence: 100 })}
                          style={{ padding: '7px 13px', background: C.accent, border: 'none', borderRadius: 7, color: '#000', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Apply</button>
                      )}
                      {!customInput.trim() && <span style={{ fontSize: 10, color: C.dim, whiteSpace: 'nowrap' }}>↵ to apply</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <div style={{ width: 230, background: C.surface, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '11px 13px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>Learned this session</span>
                {learned.length > 0 && <span style={{ fontSize: 10, padding: '1px 6px', background: C.accentBg, border: `1px solid ${C.accent}44`, borderRadius: 10, color: C.accent, fontWeight: 600 }}>{learned.length}</span>}
              </div>
              <button onClick={() => setShowSidebar(false)} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 11px' }}>
              {learned.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 10px' }}>
                  <div style={{ fontSize: 22, marginBottom: 10 }}>📚</div>
                  <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.55 }}>Click the <span style={{ color: C.accent }}>amber ▲ words</span> in any flagged segment to see translation options.<br /><br />Your choices are saved here and added to your glossary.</div>
                </div>
              ) : (
                learned.map((term, i) => (
                  <div key={i} style={{ padding: '9px 10px', background: C.card, borderRadius: 8, marginBottom: 7, borderLeft: `3px solid ${C.accent}` }}>
                    <div style={{ fontSize: 10, color: C.dim, marginBottom: 3 }}>Replaced</div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>"{term.from}"</div>
                    <div style={{ fontSize: 10, color: C.dim, marginBottom: 3 }}>→</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.accent }}>"{term.to}"</div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 3 }}>{term.note}</div>
                    <button style={{ marginTop: 7, width: '100%', padding: '4px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>+ Permanent glossary</button>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: '11px 13px', borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 6 }}>Segment progress</div>
              <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
                <div style={{ height: '100%', background: C.success, width: `${(confirmed / segs.length) * 100}%`, transition: 'width 0.3s', borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>{confirmed} of {segs.length} confirmed</div>
              {flagged > 0 && <div style={{ fontSize: 10, color: C.accent, marginTop: 2 }}>{flagged} still need review</div>}
            </div>
          </div>
        )}

        {!showSidebar && (
          <button onClick={() => setShowSidebar(true)} style={{ position: 'fixed', right: 12, bottom: 60, padding: '8px 13px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, zIndex: 20 }}>
            📚 {learned.length > 0 && <span style={{ background: C.accent, color: '#000', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{learned.length}</span>} Learned terms
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: C.success, color: '#000', padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 500, zIndex: 100, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );

  // ── DONE ──────────────────────────────────────────────────────────────────────
  return (
    <div style={W}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', border: `2px solid ${C.success}`, background: 'rgba(34,197,94,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 22 }}>✓</div>
          <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>Ready to download</h2>
          <p style={{ margin: '0 0 26px', color: C.muted, fontSize: 14 }}>{learned.length} terms learned · {edited} segments edited · {confirmed} confirmed</p>

          {learned.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14, textAlign: 'left' }}>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', fontWeight: 500, marginBottom: 10 }}>GLOSSARY UPDATES THIS SESSION</div>
              {learned.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 5, padding: '5px 0', borderBottom: i < learned.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <span style={{ color: C.dim, flex: 1 }}>{t.from}</span>
                  <span style={{ color: C.border }}>→</span>
                  <span style={{ color: C.accent, fontWeight: 500, flex: 1, textAlign: 'right' }}>{t.to}</span>
                </div>
              ))}
            </div>
          )}

          <button style={{ width: '100%', padding: '13px', background: C.accent, border: 'none', borderRadius: 11, color: '#000', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 9 }}>↓ Download translated .docx</button>
          <button onClick={() => { setScreen('upload'); setFile(null); setSegs(mkSegs()); setLearned([]); setBusy(false); setDonePasses([]); }} style={{ width: '100%', padding: '11px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Translate another</button>
        </div>
      </div>
    </div>
  );
}
