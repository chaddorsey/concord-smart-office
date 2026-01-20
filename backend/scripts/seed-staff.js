/**
 * Seed staff members into the database
 * Run with: node scripts/seed-staff.js
 */

const path = require('path');
const db = require('../db');

// Initialize database
db.initDatabase();

const staffData = require('../data/staff.json');

function seedStaff() {
  console.log(`Seeding ${staffData.length} staff members...\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const person of staffData) {
    const email = `${person.slug}@concord.org`;

    try {
      // Check if user already exists
      const existing = db.getUserByEmail(email);

      if (existing) {
        // Update avatar if needed
        if (existing.avatar_url !== person.avatar_url) {
          db.updateUser(existing.id, { avatar_url: person.avatar_url, name: person.name });
          console.log(`↻ Updated: ${person.name}`);
          updated++;
        } else {
          console.log(`- Skipped: ${person.name} (already exists)`);
          skipped++;
        }
      } else {
        // Create new user
        db.createUser({
          email,
          name: person.name,
          avatar_url: person.avatar_url,
          role: 'staff'
        });
        console.log(`✓ Created: ${person.name}`);
        created++;
      }
    } catch (err) {
      console.error(`✗ Error for ${person.name}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${created} created, ${updated} updated, ${skipped} skipped`);
}

seedStaff();
db.closeDatabase();
