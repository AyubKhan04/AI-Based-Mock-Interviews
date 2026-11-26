/** Reads a resume in the browser. The PDF never leaves the device; only its text is sent. */
export async function readResume(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error('Please use a file under 5 MB.')
  if (/\.txt$/i.test(file.name) || file.type === 'text/plain') return file.text()
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Please upload a PDF or a .txt file, or paste the text.')
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  for (let i = 1; i <= Math.min(pdf.numPages, 6); i++) {
    const content = await (await pdf.getPage(i)).getTextContent()
    let line = '', lastY = null
    const lines = []
    for (const it of content.items) {
      const y = it.transform?.[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = '' }
      line += it.str + (it.hasEOL ? '\n' : ''); lastY = y
    }
    lines.push(line)
    pages.push(lines.join('\n'))
  }
  const text = pages.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length < 50) throw new Error('This PDF has no readable text (it may be a scanned image). Please paste the text instead.')
  return text
}
