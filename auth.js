import crypto from "node:crypto";

const PASSWORD_PREFIX = "scrypt";
const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");

  return `${PASSWORD_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password, storedPassword) {
  if (!password || !storedPassword) {
    return false;
  }

  if (!storedPassword.startsWith(`${PASSWORD_PREFIX}$`)) {
    const suppliedBuffer = Buffer.from(password);
    const storedBuffer = Buffer.from(storedPassword);

    return suppliedBuffer.length === storedBuffer.length
      && crypto.timingSafeEqual(suppliedBuffer, storedBuffer);
  }

  const [, salt, storedHash] = storedPassword.split("$");

  if (!salt || !storedHash) {
    return false;
  }

  try {
    const storedBuffer = Buffer.from(storedHash, "hex");
    const suppliedBuffer = crypto.scryptSync(password, salt, storedBuffer.length);

    return storedBuffer.length === suppliedBuffer.length
      && crypto.timingSafeEqual(storedBuffer, suppliedBuffer);
  } catch {
    return false;
  }
}

export function generateTemporaryPassword() {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%",
  ];
  const allCharacters = groups.join("");
  const characters = groups.map(group => randomCharacter(group));

  while (characters.length < 16) {
    characters.push(randomCharacter(allCharacters));
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join("");
}

function randomCharacter(characters) {
  return characters[crypto.randomInt(characters.length)];
}

export async function ensureAuthSchema(db) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'employee'
    `);
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(employee_id)
    `);
    await client.query(`
      UPDATE users
      SET role = 'admin'
      WHERE employee_id IS NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_unique
      ON users(employee_id)
      WHERE employee_id IS NOT NULL
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'users_role_check'
        ) THEN
          ALTER TABLE users
          ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'employee'));
        END IF;
      END
      $$
    `);
    const legacyPasswords = await client.query(`
      SELECT user_id, password
      FROM users
      WHERE password NOT LIKE 'scrypt$%'
    `);

    for (const user of legacyPasswords.rows) {
      await client.query(
        "UPDATE users SET password = $1 WHERE user_id = $2",
        [hashPassword(user.password), user.user_id]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
