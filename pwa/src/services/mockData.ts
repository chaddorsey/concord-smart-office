// Mock data for testing without Home Assistant connection

export const MOCK_STAFF = [
  { id: 'alice', name: 'Alice Chen', entityId: 'input_boolean.staff_alice_present', avatarInitials: 'AC', isPresent: true, arrivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: 'bob', name: 'Bob Smith', entityId: 'input_boolean.staff_bob_present', avatarInitials: 'BS', isPresent: true, arrivedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
  { id: 'carol', name: 'Carol Davis', entityId: 'input_boolean.staff_carol_present', avatarInitials: 'CD', isPresent: false, arrivedAt: null },
  { id: 'dave', name: 'Dave Wilson', entityId: 'input_boolean.staff_dave_present', avatarInitials: 'DW', isPresent: true, arrivedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() },
  { id: 'eve', name: 'Eve Johnson', entityId: 'input_boolean.staff_eve_present', avatarInitials: 'EJ', isPresent: false, arrivedAt: null },
  { id: 'frank', name: 'Frank Brown', entityId: 'input_boolean.staff_frank_present', avatarInitials: 'FB', isPresent: false, arrivedAt: null },
]

export const MOCK_SPOTIFY_TRACKS = [
  {
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273ce4f1737bc8a646c8c4bd25a',
    duration: 354000,
  },
  {
    title: 'Hotel California',
    artist: 'Eagles',
    album: 'Hotel California',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2734637341b9f507521afa9a778',
    duration: 391000,
  },
  {
    title: 'Stairway to Heaven',
    artist: 'Led Zeppelin',
    album: 'Led Zeppelin IV',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273cd8f651e4e1a8d0a9e9e8d6a',
    duration: 482000,
  },
  {
    title: 'Sweet Child O\' Mine',
    artist: 'Guns N\' Roses',
    album: 'Appetite for Destruction',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273e44963b8bb127552ac761873',
    duration: 356000,
  },
]

export const MOCK_OASIS_PATTERNS = [
  { name: 'Zen Garden', icon: '🪨' },
  { name: 'Ocean Waves', icon: '🌊' },
  { name: 'Spiral Galaxy', icon: '🌀' },
  { name: 'Mountain Range', icon: '⛰️' },
  { name: 'Desert Dunes', icon: '🏜️' },
  { name: 'Celtic Knot', icon: '☘️' },
  { name: 'Mandala', icon: '🔮' },
  { name: 'Fibonacci', icon: '🐚' },
  { name: 'Labyrinth', icon: '🏛️' },
  { name: 'Peacock', icon: '🦚' },
  { name: 'Lotus', icon: '🪷' },
  { name: 'Infinity', icon: '♾️' },
]

export const MOCK_PHOTO_FRAMES = [
  { id: 'frame_1', entityId: 'media_player.photo_frame_1', name: 'Frame 1 - Lobby', isOnline: true },
  { id: 'frame_2', entityId: 'media_player.photo_frame_2', name: 'Frame 2 - Kitchen', isOnline: true },
  { id: 'frame_3', entityId: 'media_player.photo_frame_3', name: 'Frame 3 - Meeting Room', isOnline: false },
  { id: 'frame_4', entityId: 'media_player.photo_frame_4', name: 'Frame 4 - Lounge', isOnline: true },
]

export const MOCK_LOCATIONS = [
  { id: 'main-entrance', name: 'Main Entrance', type: 'entrance' as const },
  { id: 'lobby', name: 'Lobby', type: 'entrance' as const },
  { id: 'back-door', name: 'Back Door', type: 'entrance' as const },
  { id: 'front-exit', name: 'Front Exit', type: 'exit' as const },
  { id: 'office', name: 'Office', type: 'general' as const },
]

export const MOCK_PLAYLIST_IMAGES = [
  { id: '1', url: '/images/office-1.jpg', title: 'Team Building 2024', addedBy: 'Alice', addedAt: '2024-01-15' },
  { id: '2', url: '/images/office-2.jpg', title: 'Product Launch', addedBy: 'Bob', addedAt: '2024-01-10' },
  { id: '3', url: '/images/office-3.jpg', title: 'Holiday Party', addedBy: 'Carol', addedAt: '2024-01-05' },
  { id: '4', url: '/images/nature-1.jpg', title: 'Mountain View', addedBy: 'Dave', addedAt: '2024-01-01' },
  { id: '5', url: '/images/nature-2.jpg', title: 'Ocean Sunset', addedBy: 'Eve', addedAt: '2023-12-20' },
  { id: '6', url: '/images/art-1.jpg', title: 'Abstract Art', addedBy: 'Frank', addedAt: '2023-12-15' },
]

// Mock mode state management
let isMockMode = false

export function enableMockMode(): void {
  isMockMode = true
  localStorage.setItem('mockMode', 'true')
  // Auto-set a default user (Carol - not currently present, good for testing check-in)
  if (!localStorage.getItem('current_user_id')) {
    localStorage.setItem('current_user_id', 'carol')
  }
}

export function disableMockMode(): void {
  isMockMode = false
  localStorage.removeItem('mockMode')
}

export function checkMockMode(): boolean {
  // Check URL param first
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mock') === 'true') {
      enableMockMode()
      return true
    }
  }
  // Then check localStorage
  if (typeof localStorage !== 'undefined') {
    isMockMode = localStorage.getItem('mockMode') === 'true'
  }
  return isMockMode
}

export function isMockModeEnabled(): boolean {
  return isMockMode
}
