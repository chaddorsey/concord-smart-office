import { useState } from 'react'

export default function ClearCache() {
  const [status, setStatus] = useState<'idle' | 'clearing' | 'done'>('idle')

  const clearAllCaches = async () => {
    setStatus('clearing')

    try {
      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const registration of registrations) {
          await registration.unregister()
          console.log('[ClearCache] Unregistered service worker:', registration.scope)
        }
      }

      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        for (const cacheName of cacheNames) {
          await caches.delete(cacheName)
          console.log('[ClearCache] Deleted cache:', cacheName)
        }
      }

      // Clear localStorage and sessionStorage
      localStorage.clear()
      sessionStorage.clear()

      setStatus('done')

      // Reload after a brief delay to show success
      setTimeout(() => {
        window.location.href = '/'
      }, 1500)
    } catch (err) {
      console.error('[ClearCache] Error:', err)
      setStatus('done')
      setTimeout(() => {
        window.location.href = '/'
      }, 1500)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full text-center">
        <h1 className="text-xl font-black text-gray-900 font-museo mb-4">Clear App Cache</h1>

        {status === 'idle' && (
          <>
            <p className="text-gray-600 mb-6">
              This will clear cached data and reload the app with the latest version.
            </p>
            <button
              onClick={clearAllCaches}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 active:bg-blue-800"
            >
              Clear Cache & Reload
            </button>
          </>
        )}

        {status === 'clearing' && (
          <div className="py-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Clearing cache...</p>
          </div>
        )}

        {status === 'done' && (
          <div className="py-4">
            <div className="text-green-500 text-4xl mb-4">✓</div>
            <p className="text-gray-600">Cache cleared! Reloading...</p>
          </div>
        )}
      </div>
    </div>
  )
}
