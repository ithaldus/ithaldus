import { useState, useEffect, useRef } from 'react'
import { api, type StockImageMeta } from '../lib/api'
import { Image, Plus, Trash2, Search, X, Upload, ImageOff } from 'lucide-react'
import { ImageCropper } from '../components/ImageCropper'

export function StockImages() {
  const [images, setImages] = useState<StockImageMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [showTab, setShowTab] = useState<'missing' | 'all'>('missing')

  // Upload state
  const [selectedImage, setSelectedImage] = useState<StockImageMeta | null>(null)
  const [imageToCrop, setImageToCrop] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadImages()
  }, [])

  async function loadImages() {
    try {
      const data = await api.stockImages.list()
      setImages(data)
    } catch (err) {
      console.error('Failed to load stock images:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    const image = images.find(i => i.id === id)
    if (!confirm(`Delete stock image entry for ${image?.vendor} ${image?.model}?`)) return

    try {
      await api.stockImages.delete(id)
      setImages(prev => prev.filter(i => i.id !== id))
    } catch (err) {
      console.error('Failed to delete stock image:', err)
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB')
      return
    }

    // Read file and open cropper
    const reader = new FileReader()
    reader.onload = (e) => {
      setImageToCrop(e.target?.result as string)
    }
    reader.readAsDataURL(file)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleCropComplete(croppedImage: string) {
    if (!selectedImage) return

    setImageToCrop(null)
    setUploading(true)

    try {
      // Extract base64 data from data URL
      const [, data] = croppedImage.split(',')
      const mimeType = croppedImage.match(/data:([^;]+);/)?.[1] || 'image/jpeg'

      await api.stockImages.update(selectedImage.id, { data, mimeType })

      // Refresh list
      await loadImages()
      setSelectedImage(null)
    } catch (err) {
      console.error('Failed to upload image:', err)
      alert('Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  // Filter images
  const filteredImages = images.filter(img => {
    const matchesFilter = filter === '' ||
      img.vendor.toLowerCase().includes(filter.toLowerCase()) ||
      img.model.toLowerCase().includes(filter.toLowerCase())

    if (showTab === 'missing') {
      return matchesFilter && !img.hasImage
    }
    return matchesFilter
  })

  const missingCount = images.filter(i => !i.hasImage).length
  const withImageCount = images.filter(i => i.hasImage).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-950 overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Image className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                Stock Images
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {images.length} model{images.length !== 1 ? 's' : ''} • {missingCount} missing image{missingCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs and Search */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex bg-slate-200 dark:bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setShowTab('missing')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                showTab === 'missing'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Missing ({missingCount})
            </button>
            <button
              onClick={() => setShowTab('all')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                showTab === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All ({images.length})
            </button>
          </div>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by vendor or model..."
              className="w-full pl-10 pr-10 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Images Grid */}
        {filteredImages.length === 0 ? (
          <div className="text-center py-12">
            <Image className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">
              {filter ? 'No matching images' : showTab === 'missing' ? 'All models have images!' : 'No stock images yet'}
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              {showTab === 'missing' && !filter ? 'Run a scan to discover device models' : ''}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredImages.map((image) => (
              <div
                key={image.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden group"
              >
                {/* Image / Placeholder */}
                <div
                  className="aspect-square relative cursor-pointer"
                  onClick={() => {
                    setSelectedImage(image)
                    fileInputRef.current?.click()
                  }}
                >
                  {image.hasImage ? (
                    <StockImagePreview imageId={image.id} />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 group-hover:bg-amber-50 dark:group-hover:bg-amber-900/20 group-hover:text-amber-500 transition-colors">
                      <ImageOff className="w-8 h-8 mb-2" />
                      <span className="text-xs">Click to add</span>
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Upload className="w-6 h-6 text-white" />
                  </div>
                </div>

                {/* Info */}
                <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-medium text-slate-900 dark:text-white truncate" title={image.vendor}>
                    {image.vendor}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate" title={image.model}>
                    {image.model}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">
                      {image.deviceCount} device{image.deviceCount !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(image.id)
                      }}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                      title="Delete entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Image Cropper Modal */}
      {imageToCrop && (
        <ImageCropper
          image={imageToCrop}
          onCropComplete={handleCropComplete}
          onCancel={() => {
            setImageToCrop(null)
            setSelectedImage(null)
          }}
        />
      )}

      {/* Uploading overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-500" />
            <span className="text-slate-900 dark:text-white">Uploading image...</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Component to lazily load stock image preview
function StockImagePreview({ imageId }: { imageId: string }) {
  const [imageData, setImageData] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await api.stockImages.get(imageId)
        if (!cancelled && data.data) {
          setImageData(`data:${data.mimeType};base64,${data.data}`)
        }
      } catch (err) {
        console.error('Failed to load image:', err)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [imageId])

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-800">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-500" />
      </div>
    )
  }

  if (!imageData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400">
        <ImageOff className="w-8 h-8" />
      </div>
    )
  }

  return (
    <img
      src={imageData}
      alt=""
      className="w-full h-full object-cover"
    />
  )
}
