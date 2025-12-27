import { useState, useRef, useCallback } from 'react'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { X, Check } from 'lucide-react'

interface ImageCropperProps {
  image: string // base64 or URL
  onCropComplete: (croppedImage: string) => void
  onCancel: () => void
}

// Create a cropped image from the original
function getCroppedImg(image: HTMLImageElement, crop: PixelCrop): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  // Set canvas size to the crop size
  canvas.width = crop.width
  canvas.height = crop.height

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  )

  return canvas.toDataURL('image/jpeg', 0.9)
}

export function ImageCropper({ image, onCropComplete, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const imgRef = useRef<HTMLImageElement>(null)

  const handleSave = useCallback(() => {
    if (!completedCrop || !imgRef.current) return

    try {
      const croppedImage = getCroppedImg(imgRef.current, completedCrop)
      onCropComplete(croppedImage)
    } catch (err) {
      console.error('Failed to crop image:', err)
    }
  }, [completedCrop, onCropComplete])

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
          Cancel
        </button>
        <span className="text-white font-medium">Drag to select crop area</span>
        <button
          onClick={handleSave}
          disabled={!completedCrop?.width || !completedCrop?.height}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium transition-colors"
        >
          <Check className="w-5 h-5" />
          Apply
        </button>
      </div>

      {/* Cropper Area */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <ReactCrop
          crop={crop}
          onChange={(c) => setCrop(c)}
          onComplete={(c) => setCompletedCrop(c)}
          className="max-h-full"
        >
          <img
            ref={imgRef}
            src={image}
            alt="Crop"
            style={{ maxHeight: 'calc(100vh - 120px)', maxWidth: '100%' }}
          />
        </ReactCrop>
      </div>
    </div>
  )
}
