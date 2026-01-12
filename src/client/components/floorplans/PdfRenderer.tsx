import { useRef, useEffect, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Set up PDF.js worker using local file from node_modules
// @ts-expect-error - Vite handles this import
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

interface PdfRendererProps {
  pdfData: string  // Base64-encoded PDF
  pageWidth: number  // PDF page width in points
  pageHeight: number  // PDF page height in points
  zoomScale?: number  // Current zoom level from panzoom (default 1)
}

export function PdfRenderer({
  pdfData,
  pageWidth,
  pageHeight,
  zoomScale = 1,
}: PdfRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null)
  const isRenderingRef = useRef(false)
  const pendingRenderRef = useRef(false)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const zoomScaleRef = useRef(zoomScale)
  zoomScaleRef.current = zoomScale

  // Load PDF document
  useEffect(() => {
    async function loadPdf() {
      try {
        setLoading(true)
        setError(null)

        // Decode base64 PDF data
        const binaryString = atob(pdfData)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        const loadingTask = pdfjsLib.getDocument({ data: bytes })
        const doc = await loadingTask.promise
        setPdfDoc(doc)
      } catch (err) {
        console.error('Failed to load PDF:', err)
        setError('Failed to load PDF')
      } finally {
        setLoading(false)
      }
    }

    loadPdf()
  }, [pdfData])

  // Render PDF page to canvas - re-renders when zoom changes for crisp display
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return

    // If already rendering, mark that we need another render after this one
    if (isRenderingRef.current) {
      pendingRenderRef.current = true
      // Cancel current render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
      }
      return
    }

    isRenderingRef.current = true
    pendingRenderRef.current = false

    try {
      const page = await pdfDoc.getPage(1)

      // Calculate render scale for crisp display:
      // - devicePixelRatio for high-DPI screens
      // - zoomScale to maintain quality when zoomed in
      // - Cap at 8x to avoid memory issues while allowing deep zoom
      const dpr = window.devicePixelRatio || 1
      const renderScale = Math.min(dpr * Math.max(zoomScaleRef.current, 1), 8)

      const viewport = page.getViewport({ scale: renderScale })

      const canvas = canvasRef.current
      if (!canvas) return
      const context = canvas.getContext('2d')
      if (!context) return

      canvas.width = viewport.width
      canvas.height = viewport.height

      const renderTask = page.render({
        canvasContext: context,
        viewport,
      })
      renderTaskRef.current = renderTask

      await renderTask.promise
      renderTaskRef.current = null
    } catch (err) {
      // Ignore cancelled render errors
      if (err instanceof Error && err.name === 'RenderingCancelledException') {
        // Don't return yet - check for pending render below
      } else {
        console.error('Failed to render PDF page:', err)
        setError('Failed to render PDF page')
      }
    } finally {
      isRenderingRef.current = false
      // If a render was requested while we were rendering, do it now
      if (pendingRenderRef.current) {
        pendingRenderRef.current = false
        setTimeout(renderPage, 50)
      }
    }
  }, [pdfDoc])

  // Debounce re-rendering when zoom changes
  useEffect(() => {
    const timeoutId = setTimeout(renderPage, 150)
    return () => clearTimeout(timeoutId)
  }, [renderPage, zoomScale])

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full text-red-500">
        {error}
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full object-contain"
      style={{ background: '#fff' }}
    />
  )
}

export default PdfRenderer
