import JSZip from 'jszip'

// ── Parse .docx → extract paragraphs ─────────────────────────────────────────
export async function parseDocx(file) {
  const zip = await JSZip.loadAsync(file)
  const xml = await zip.file('word/document.xml').async('text')

  // Extract all <w:p>...</w:p> blocks
  const paraRx = /<w:p[ >][\s\S]*?<\/w:p>/g
  const paraBlocks = xml.match(paraRx) || []

  const paragraphs = []
  for (let i = 0; i < paraBlocks.length; i++) {
    const block = paraBlocks[i]
    // Concatenate all <w:t> text within this paragraph
    const textParts = [...block.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1])
    const text = textParts.join('').trim()
    if (text) paragraphs.push({ idx: i, text, blockIdx: xml.indexOf(block) })
  }

  // Estimate stats
  const wordCount = paragraphs.reduce((n, p) => n + p.text.split(/\s+/).length, 0)
  const pageEst   = Math.max(1, Math.round(wordCount / 250))
  const tokens    = Math.round(wordCount * 1.8)
  const costEst   = ((tokens * 1.5 / 1e6) + (tokens * 1.5 * 2 / 1e6)).toFixed(3)

  return { zip, xml, paragraphs, wordCount, pageEst, tokens: tokens * 3, costEst }
}

// ── Rebuild .docx with translated text ───────────────────────────────────────
export async function buildDocx(zip, originalXml, paragraphs, translations) {
  let newXml = originalXml

  // For each translatable paragraph, replace its text content
  for (let i = 0; i < paragraphs.length; i++) {
    const para    = paragraphs[i]
    const trans   = translations[i]
    if (!trans) continue

    // Find the paragraph XML block
    const paraRx  = new RegExp(`(<w:p[ >][\\s\\S]*?<\\/w:p>)`)
    const paraBlocks = [...newXml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    const match = paraBlocks.find(m => {
      const texts = [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('').trim()
      return texts === para.text
    })
    if (!match) continue

    const oldBlock = match[0]

    // Extract paragraph properties and first run properties
    const pPr  = (oldBlock.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0]
    const rPr  = (oldBlock.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0]

    // Escape XML characters in translation
    const escaped = trans
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

    const hasEdge = trans.startsWith(' ') || trans.endsWith(' ')
    const tAttr   = hasEdge ? ' xml:space="preserve"' : ''

    const newBlock = `<w:p>${pPr}<w:r>${rPr}<w:t${tAttr}>${escaped}</w:t></w:r></w:p>`
    newXml = newXml.replace(oldBlock, newBlock)
  }

  // Assemble new zip (copy everything, replace document.xml)
  const newZip = new JSZip()
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) { newZip.folder(name); continue }
    if (name === 'word/document.xml') {
      newZip.file(name, newXml)
    } else {
      newZip.file(name, await entry.async('arraybuffer'))
    }
  }

  return newZip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  })
}

// ── Trigger browser download ──────────────────────────────────────────────────
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
