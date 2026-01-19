// Pixabay video service - fetches videos from the frame-display server proxy

export type VideoOrientation = 'horizontal' | 'vertical'

export interface PixabayVideo {
  id: string
  source: 'pixabay'
  sourceId: number
  title: string
  type: 'video'
  thumbnail: string
  previewUrl: string
  url: string
  hdUrl: string
  duration: number
  user: string
  tags: string
  views: number
  downloads: number
  width: number
  height: number
  orientation: VideoOrientation
}

export interface PixabaySearchResult {
  total: number
  page: number
  perPage: number
  videos: PixabayVideo[]
}

// Use relative URLs to go through Vite proxy (fixes cross-origin issues on mobile)
const getHeaders = () => ({
  'ngrok-skip-browser-warning': 'true'
})

export const pixabayService = {
  async searchVideos(query: string, options: {
    page?: number
    perPage?: number
    category?: string
  } = {}): Promise<PixabaySearchResult> {
    const params = new URLSearchParams({
      q: query,
      page: String(options.page || 1),
      per_page: String(options.perPage || 20)
    })

    if (options.category) {
      params.set('category', options.category)
    }

    const response = await fetch(`/api/pixabay/videos?${params}`, {
      headers: getHeaders()
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || error.error || 'Failed to fetch videos')
    }

    return response.json()
  },

  async getCategories(): Promise<string[]> {
    const response = await fetch('/api/pixabay/categories', {
      headers: getHeaders()
    })

    if (!response.ok) {
      throw new Error('Failed to fetch categories')
    }

    const data = await response.json()
    return data.categories
  }
}
