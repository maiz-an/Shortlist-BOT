// Creates backend/.env and frontend/.env with fresh random secrets (never overwrites existing files).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const backendEnv = path.join(__dirname, '..', '.env');
const frontendEnv = path.join(__dirname, '..', '..', 'frontend', '.env');
const rand = (n) => crypto.randomBytes(n).toString('hex');

if (fs.existsSync(backendEnv)) {
  console.log('backend/.env already exists - left untouched.');
} else {
  const token = rand(24);
  const text = fs
    .readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8')
    .replace(/^API_TOKEN=.*$/m, `API_TOKEN=${token}`)
    .replace(/^TOKEN_ENCRYPTION_KEY=.*$/m, `TOKEN_ENCRYPTION_KEY=${rand(32)}`);
  fs.writeFileSync(backendEnv, text);
  if (!fs.existsSync(frontendEnv)) {
    fs.writeFileSync(frontendEnv, `VITE_API_BASE_URL=\nVITE_API_TOKEN=${token}\n`);
  }
  console.log('Created backend/.env and frontend/.env. Edit DATABASE_URL in backend/.env to match your PostgreSQL password.');
}
