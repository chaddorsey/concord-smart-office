// Announcement Service - Stub implementation
// TODO: Persist announcements to database

let announcements = [];
let currentAlert = null;
let nextId = 1;

function getActiveAnnouncements() {
  const now = new Date();
  return announcements.filter(a => {
    if (a.expiresAt && new Date(a.expiresAt) < now) return false;
    return true;
  });
}

function getCurrentAlert() {
  return currentAlert;
}

function createAnnouncement({ title, message, type = 'info', expiresAt = null, isAlert = false }) {
  const announcement = {
    id: nextId++,
    title,
    message,
    type,
    expiresAt,
    isAlert,
    createdAt: new Date().toISOString()
  };
  announcements.push(announcement);
  if (isAlert) currentAlert = announcement;
  return announcement;
}

function updateAnnouncement(id, updates) {
  const index = announcements.findIndex(a => a.id === id);
  if (index === -1) return null;
  announcements[index] = { ...announcements[index], ...updates };
  return announcements[index];
}

function deleteAnnouncement(id) {
  const index = announcements.findIndex(a => a.id === id);
  if (index === -1) return false;
  announcements.splice(index, 1);
  if (currentAlert && currentAlert.id === id) currentAlert = null;
  return true;
}

function dismissAllAlerts() {
  const count = currentAlert ? 1 : 0;
  currentAlert = null;
  return count;
}

module.exports = {
  getActiveAnnouncements,
  getCurrentAlert,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  dismissAllAlerts
};
