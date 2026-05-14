import JSZip from 'jszip'

export async function parseDocx(file) {
  const zip = await JSZip.loadAsync(file)
  const xml = await zip.file('word/document.xml').async('text')
  const paraBlocks = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []
  const paragraphs = []
  for (let i = 0; i < paraBlocks.length; i++) {
    const block = paraBlocks[i]
    const text = [...block.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>m[1]).join('').trim()
    if (text) paragraphs.push({ idx:i, text })
  }
  const wordCount = paragraphs.reduce((n,p)=>n+p.text.split(/\s+/).length,0)
  const pageEst   = Math.max(1,Math.round(wordCount/250))
  const tokens    = Math.round(wordCount*1.8)*3
  const costEst   = ((tokens*0.6/1e6)+(tokens*0.4*3/1e6)).toFixed(3)
  return { zip, xml, paragraphs, wordCount, pageEst, tokens, costEst }
}

// Lightweight text extraction for reference doc analysis
export async function extractTextOnly(file) {
  const zip = await JSZip.loadAsync(file)
  const xml = await zip.file('word/document.xml').async('text')
  const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>m[1])
  return texts.join(' ').replace(/\s+/g,' ').trim()
}

export async function buildDocx(zip, originalXml, paragraphs, translations) {
  let newXml = originalXml
  const paraBlocks = [...newXml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]

  for (let i = 0; i < paragraphs.length; i++) {
    const trans = translations[i]
    if (!trans) continue
    const match = paraBlocks.find(m => {
      const t = [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x=>x[1]).join('').trim()
      return t === paragraphs[i].text
    })
    if (!match) continue

    const oldBlock = match[0]
    const pPr = (oldBlock.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)||[''])[0]
    const rPr = (oldBlock.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)||[''])[0]
    const escaped = trans.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    const hasEdge = trans.startsWith(' ')||trans.endsWith(' ')
    const newBlock = `<w:p>${pPr}<w:r>${rPr}<w:t${hasEdge?' xml:space="preserve"':''}>${escaped}</w:t></w:r></w:p>`
    newXml = newXml.replace(oldBlock, newBlock)
  }

  const newZip = new JSZip()
  for (const [name,entry] of Object.entries(zip.files)) {
    if (entry.dir) { newZip.folder(name); continue }
    newZip.file(name, name==='word/document.xml' ? newXml : await entry.async('arraybuffer'))
  }
  return newZip.generateAsync({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression:'DEFLATE' })
}

export function downloadBlob(blob,filename) {
  const url=URL.createObjectURL(blob), a=document.createElement('a')
  a.href=url; a.download=filename; document.body.appendChild(a); a.click()
  document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url),1000)
}
