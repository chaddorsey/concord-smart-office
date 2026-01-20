// Avatar Service - Stub implementation
// TODO: Persist avatar mappings to database

const avatarMappings = new Map();

function getAvatarUrl(email) {
  if (avatarMappings.has(email)) {
    return avatarMappings.get(email);
  }
  // Return gravatar-style default
  return generateInitialsAvatar(email);
}

function getAllMappings() {
  return Object.fromEntries(avatarMappings);
}

function setAvatarMapping(email, avatarUrl) {
  avatarMappings.set(email, avatarUrl);
}

async function cacheAvatar(email, sourceUrl, name) {
  // For now, just store the source URL directly
  setAvatarMapping(email, sourceUrl);
  return sourceUrl;
}

function generateInitialsAvatar(email, name) {
  // Generate a simple initials-based avatar URL using UI Avatars service
  const displayName = name || email.split('@')[0];
  const initials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random&size=128`;
}

async function bulkImportAvatars(users) {
  const results = [];
  for (const user of users) {
    if (user.email && user.avatarUrl) {
      setAvatarMapping(user.email, user.avatarUrl);
      results.push({ email: user.email, success: true });
    }
  }
  return results;
}

function deleteMapping(email) {
  return avatarMappings.delete(email);
}

module.exports = {
  getAvatarUrl,
  getAllMappings,
  setAvatarMapping,
  cacheAvatar,
  generateInitialsAvatar,
  bulkImportAvatars,
  deleteMapping
};
