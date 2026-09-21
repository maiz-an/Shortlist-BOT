// Local PostgreSQL-compatible server for machines that cannot install PostgreSQL.
// PGlite is real Postgres compiled to WebAssembly: no native binaries, no admin rights.
// Data persists in ./pgdata. On first start it applies backend/prisma/migrations/*/migration.sql.
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');

const PORT = Number(process.env.PGLITE_PORT || 5432);

async function applyMigrations(db) {
  const { rows } = await db.query(`SELECT to_regclass('public."Job"') AS t`);
  if (rows[0].t) return false; // already migrated
  const dir = path.join(__dirname, '..', 'backend', 'prisma', 'migrations');
  const folders = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const f of folders) {
    await db.exec(fs.readFileSync(path.join(dir, f, 'migration.sql'), 'utf8'));
    console.log(`applied migration ${f}`);
  }
  return true;
}

(async () => {
  const db = await PGlite.create(path.join(__dirname, 'pgdata'));
  const fresh = await applyMigrations(db);
  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1', maxConnections: 20 });
  await server.start();
  console.log(`PGlite Postgres listening on 127.0.0.1:${PORT} (data: Setup/pgdata)`);
  if (fresh) console.log('New database created. Now run "npm run db:seed" in the backend folder.');
})();
