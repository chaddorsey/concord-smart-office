import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, PresenceProvider, SpotifyProvider, MusicProvider, OasisProvider, PhotoFrameProvider } from './stores'
import { initializeHAConnection } from './services/haWebSocket'
import Login from './views/Login'
import Dashboard from './views/Dashboard'
import ScanIn from './views/ScanIn'
import QuickCheckIn from './views/QuickCheckIn'
import WhosIn from './views/WhosIn'
import Music from './views/Music'
import SandTable from './views/SandTable'
import PhotoFrames from './views/PhotoFrames'
import BrowseVideos from './views/BrowseVideos'
import ClearCache from './views/ClearCache'

function App() {
  const [_haConnected, setHaConnected] = useState(false)

  // Initialize Home Assistant connection on startup
  useEffect(() => {
    initializeHAConnection().then(setHaConnected)
  }, [])
  return (
    <AuthProvider>
      <PresenceProvider>
        <SpotifyProvider>
          <MusicProvider>
            <OasisProvider>
              <PhotoFrameProvider>
                <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Navigate to="/login" replace />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/scan" element={<ScanIn />} />
                  <Route path="/quick-checkin" element={<QuickCheckIn />} />
                  <Route path="/whos-in" element={<WhosIn />} />
                  <Route path="/music" element={<Music />} />
                  <Route path="/sand" element={<SandTable />} />
                  <Route path="/photos" element={<PhotoFrames />} />
                  <Route path="/frames" element={<PhotoFrames />} />
                  <Route path="/browse-videos" element={<BrowseVideos />} />
                  <Route path="/create-pattern" element={<Navigate to="/sand" replace />} />
                  <Route path="/clear-cache" element={<ClearCache />} />
                </Routes>
              </BrowserRouter>
              </PhotoFrameProvider>
            </OasisProvider>
          </MusicProvider>
        </SpotifyProvider>
      </PresenceProvider>
    </AuthProvider>
  )
}

export default App
