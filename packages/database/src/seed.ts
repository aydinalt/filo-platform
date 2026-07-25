import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL
});

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const tenantId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
await pool.query(
  `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)
   ON CONFLICT (id) DO NOTHING`,
  [tenantId, "Demo Filo A.Ş.", "demo-filo"]
);
await pool.query(
  `INSERT INTO users (id, email, full_name, password_hash)
   VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
  [userId, "admin@demo.filo", "Demo Yönetici", hashPassword("FiloDemo123!")]
);
await pool.query(
  `INSERT INTO memberships (tenant_id, user_id, role)
   VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
  [tenantId, userId]
);
console.log("Seed complete: admin@demo.filo / FiloDemo123!");
await pool.end();
