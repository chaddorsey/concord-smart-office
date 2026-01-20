/**
 * Download staff avatars from concord.org
 * Run with: node scripts/download-staff-avatars.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const STAFF = [
  { name: 'Leslie Bondaryk', url: 'https://concord.org/wp-content/uploads/2023/07/leslie-bondaryk.jpg' },
  { name: 'Susan Brau', url: 'https://concord.org/wp-content/uploads/2023/07/susan-brau.jpg' },
  { name: 'Kiley Brown', url: 'https://concord.org/wp-content/uploads/2023/07/kiley-mcelroy-brown.jpg' },
  { name: 'Lisa Buoncuore', url: 'https://concord.org/wp-content/uploads/2023/07/lisa-buoncuore.jpg' },
  { name: 'Jie Chao', url: 'https://concord.org/wp-content/uploads/2023/07/jie-chao.jpg' },
  { name: 'Scott Cytacki', url: 'https://concord.org/wp-content/uploads/2023/07/scott-cytacki.jpg' },
  { name: 'Dan Damelin', url: 'https://concord.org/wp-content/uploads/2023/07/dan-damelin.jpg' },
  { name: 'Chad Dorsey', url: 'https://concord.org/wp-content/uploads/2023/07/chad-dorsey-2025-2.jpg' },
  { name: 'Rebecca Ellis', url: 'https://concord.org/wp-content/uploads/2023/06/rebecca-ellis.jpg' },
  { name: 'William Finzer', url: 'https://concord.org/wp-content/uploads/2023/07/william-finzer.jpg' },
  { name: 'Teale Fristoe', url: 'https://concord.org/wp-content/uploads/2023/07/teale-fristoe.jpg' },
  { name: 'Kathy Jessen Eller', url: 'https://concord.org/wp-content/uploads/2023/07/placeholder-f.jpg' },
  { name: 'Danielle Kehoe', url: 'https://concord.org/wp-content/uploads/2023/07/danielle-kehoe-headshot2.jpg' },
  { name: 'Hee-Sun Lee', url: 'https://concord.org/wp-content/uploads/2023/07/hee-sun-lee.jpg' },
  { name: 'Trudi Lord', url: 'https://concord.org/wp-content/uploads/2023/07/trudi-lord.jpg' },
  { name: 'Christopher Lore', url: 'https://concord.org/wp-content/uploads/2023/07/chris-lore.jpg' },
  { name: 'Doug Martin', url: 'https://concord.org/wp-content/uploads/2023/07/doug-martin.jpg' },
  { name: 'Ethan McElroy', url: 'https://concord.org/wp-content/uploads/2023/07/ethan-mcelroy.jpg' },
  { name: 'Cynthia McIntyre', url: 'https://concord.org/wp-content/uploads/2023/07/cynthia-mcintyre.jpg' },
  { name: 'Kate Miller', url: 'https://concord.org/wp-content/uploads/2023/07/kate-miller.jpg' },
  { name: 'Amy Pallant', url: 'https://concord.org/wp-content/uploads/2023/07/amy-pallant.jpg' },
  { name: 'Judi Raiff', url: 'https://concord.org/wp-content/uploads/2023/07/judi-raiff.jpg' },
  { name: 'Lynn Stephens', url: 'https://concord.org/wp-content/uploads/2023/07/lynn-stephens.jpg' },
  { name: 'Kirk Swenson', url: 'https://concord.org/wp-content/uploads/2023/07/kirk-swenson.jpg' },
  { name: 'Michael Tirenin', url: 'https://concord.org/wp-content/uploads/2023/07/placeholder-m.jpg' },
  { name: 'Aditi Wagh', url: 'https://concord.org/wp-content/uploads/2025/09/aditi-wagh-headshot.jpg' },
  { name: 'Robert Tinker', url: 'https://concord.org/wp-content/uploads/images/people/staff/bob-tinker.jpg' },
];

const AVATARS_DIR = path.join(__dirname, '../public/avatars');

// Ensure avatars directory exists
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const filepath = path.join(AVATARS_DIR, filename);

    const file = fs.createWriteStream(filepath);

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(filepath);
        return downloadImage(response.headers.location, filename).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(filepath);
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      reject(err);
    });
  });
}

async function main() {
  console.log(`Downloading ${STAFF.length} staff avatars to ${AVATARS_DIR}...\n`);

  const results = [];

  for (const person of STAFF) {
    const slug = slugify(person.name);
    const ext = path.extname(person.url) || '.jpg';
    const filename = `${slug}${ext}`;

    try {
      await downloadImage(person.url, filename);
      console.log(`✓ ${person.name} -> ${filename}`);
      results.push({ ...person, slug, filename, avatar_url: `/avatars/${filename}` });
    } catch (err) {
      console.error(`✗ ${person.name}: ${err.message}`);
      results.push({ ...person, slug, filename: null, avatar_url: null });
    }
  }

  // Write staff data JSON for seeding
  const staffDataPath = path.join(__dirname, '../data/staff.json');
  fs.writeFileSync(staffDataPath, JSON.stringify(results, null, 2));
  console.log(`\nStaff data written to ${staffDataPath}`);

  const successful = results.filter(r => r.filename).length;
  console.log(`\nDone: ${successful}/${STAFF.length} avatars downloaded`);
}

main().catch(console.error);
