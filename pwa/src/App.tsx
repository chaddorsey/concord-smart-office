import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, PresenceProvider, SpotifyProvider, SandTableProvider, PhotoFrameProvider } from './stores'
import { initializeHAConnection } from './services/haWebSocket'
import Login from './views/Login'
import Dashboard from './views/Dashboard'
import ScanIn from './views/ScanIn'
import Music from './views/Music'
import SandTable from './views/SandTable'
import PhotoFrames from './views/PhotoFrames'
import BrowseVideos from './views/BrowseVideos'

function App() {
  const [haConnected, setHaConnected] = useState(false)

  // Initialize Home Assistant connection on startup
  useEffect(() => {
    initializeHAConnection().then(setHaConnected)
  }, [])
  return (
    <AuthProvider>
      <PresenceProvider>
        <SpotifyProvider>
          <SandTableProvider>
            <PhotoFrameProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Navigate to="/login" replace />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/scan" element={<ScanIn />} />
                  <Route path="/music" element={<Music />} />
                  <Route path="/sand" element={<SandTable />} />
                  <Route path="/photos" element={<PhotoFrames />} />
                  <Route path="/frames" element={<PhotoFrames />} />
                  <Route path="/browse-videos" element={<BrowseVideos />} />
                </Routes>
              </BrowserRouter>
            </PhotoFrameProvider>
          </SandTableProvider>
        </SpotifyProvider>
      </PresenceProvider>
    </AuthProvider>
  )
}

export default App
