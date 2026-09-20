import express from "express";
import cors from "cors";
import pg from "pg";
import path from "path";
import session from "express-session";
import { fileURLToPath } from "url";
import { ensureAuthSchema, verifyPassword } from "./auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = __dirname;

const app = express();

app.use(cors());
app.use(express.json());
app.use("/employee-login-credentials.csv", (req, res) => {
  res.status(404).end();
});
app.use(express.static(publicDir));

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

const db = new pg.Pool({
  user: process.env.DB_USER || "jakub",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "jakub",
  password: process.env.DB_PASSWORD || "",
  port: Number(process.env.DB_PORT) || 5432,
});

app.use(session({
  secret: process.env.SESSION_SECRET || "ticket-app-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    secure: false
  }
}));

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (req.session.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access is required" });
  }

  next();
}

function isAdmin(req) {
  return req.session.user.role === "admin";
}

const priorityRules = {
  high: [
    "urgent",
    "critical",
    "emergency",
    "asap",
    "outage",
    "down",
    "broken",
    "cannot work",
    "can't work",
    "cant work",
    "cannot login",
    "can't login",
    "cant login",
    "no internet",
    "network down",
    "data loss",
    "security",
    "virus",
    "malware",
    "ransomware",
    "smoke",
    "burning",
    "overheating",
    "crash",
    "crashing",
  ],
  medium: [
    "error",
    "issue",
    "problem",
    "slow",
    "freezing",
    "freeze",
    "printer",
    "vpn",
    "email",
    "outlook",
    "teams",
    "password",
    "battery",
    "monitor",
    "keyboard",
    "mouse",
    "update",
    "software",
    "install",
  ],
};

function getPriority(problem) {
  const text = problem.toLowerCase();

  if (priorityRules.high.some(keyword => text.includes(keyword))) {
    return "high";
  }

  if (priorityRules.medium.some(keyword => text.includes(keyword))) {
    return "medium";
  }

  return "low";
}

async function ensureTicketsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      ticket_id SERIAL PRIMARY KEY,
      employee_id INTEGER REFERENCES employees(employee_id),
      machine_id INTEGER REFERENCES machines(id),
      user_name TEXT NOT NULL,
      asset_tag TEXT NOT NULL,
      ticket_type TEXT NOT NULL DEFAULT 'hardware_problem' CHECK (ticket_type IN ('contact', 'hardware_problem', 'software_problem')),
      problem TEXT NOT NULL,
      problem_description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'hardware_problem'
      CHECK (ticket_type IN ('contact', 'hardware_problem', 'software_problem'))
  `);

  await db.query(`
    UPDATE tickets
    SET ticket_type = 'hardware_problem'
    WHERE ticket_type IS NULL
  `);

  await db.query(`
    ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS problem_description TEXT NOT NULL DEFAULT ''
  `);

  await db.query(`
    UPDATE tickets
    SET problem_description = ''
    WHERE problem_description IS NULL
  `);
}

async function findAssignedMachine(userName, assetTag) {
  const result = await db.query(
    `SELECT
       e.employee_id,
       e.full_name,
       m.id AS machine_id,
       m.asset_tag,
       m.brand,
       m.model
     FROM employees e
     JOIN machines m ON m.employee_id = e.employee_id
     WHERE LOWER(e.full_name) = LOWER($1)
       AND LOWER(m.asset_tag) = LOWER($2)
     LIMIT 1`,
    [userName, assetTag]
  );

  return result.rows[0];
}

async function findEmployeeMachine(employeeId, assetTag) {
  const result = await db.query(
    `SELECT
       e.employee_id,
       e.full_name,
       m.id AS machine_id,
       m.asset_tag,
       m.brand,
       m.model
     FROM employees e
     JOIN machines m ON m.employee_id = e.employee_id
     WHERE e.employee_id = $1
       AND LOWER(m.asset_tag) = LOWER($2)
     LIMIT 1`,
    [employeeId, assetTag]
  );

  return result.rows[0];
}

app.post("/login", async (req, res) => {
  try {
    const username = req.body.username?.trim();
    const password = req.body.password;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const result = await db.query(
      `SELECT
         u.user_id,
         u.username,
         u.password,
         u.role,
         u.employee_id,
         e.full_name
       FROM users u
       LEFT JOIN employees e ON e.employee_id = u.employee_id
       WHERE LOWER(u.username) = LOWER($1)
       LIMIT 1`,
      [username]
    );

    if (result.rowCount === 0 || !verifyPassword(password, result.rows[0].password)) {
      return res.status(401).json({ error: "Invalid login or password" });
    }

    const user = result.rows[0];
    req.session.user = {
      id: user.user_id,
      username: user.username,
      role: user.role,
      employee_id: user.employee_id,
      full_name: user.full_name,
    };

    res.json({ user: req.session.user });
  } catch (err) {
    console.error("POST /login error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("POST /logout error:", err);
      return res.status(500).json({ error: "Could not log out" });
    }

    res.clearCookie("connect.sid");
    res.json({ message: "Logged out" });
  });
});

app.get("/session", (req, res) => {
  res.json({
    authenticated: Boolean(req.session.user),
    user: req.session.user ?? null
  });
});

app.get("/ticket-options", requireAuth, async (req, res) => {
  try {
    const employeeFilter = isAdmin(req) ? "" : "WHERE e.employee_id = $1";
    const values = isAdmin(req) ? [] : [req.session.user.employee_id];
    const result = await db.query(
      `SELECT
         e.full_name,
         m.asset_tag,
         m.brand,
         m.model
       FROM employees e
       JOIN machines m ON m.employee_id = e.employee_id
       ${employeeFilter}
       ORDER BY e.full_name, m.asset_tag`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /ticket-options error:", err);
    res.status(500).json({ error: "Could not load users and machines" });
  }
});

app.get("/inventory", requireAuth, async (req, res) => {
  try {
    const employeeFilter = isAdmin(req) ? "" : "WHERE m.employee_id = $1";
    const values = isAdmin(req) ? [] : [req.session.user.employee_id];
    const result = await db.query(
      `SELECT m.*, e.full_name AS assigned_to
       FROM machines m
       LEFT JOIN employees e ON e.employee_id = m.employee_id
       ${employeeFilter}
       ORDER BY m.asset_tag`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /inventory error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/tickets", requireAuth, async (req, res) => {
  try {
    const employeeFilter = isAdmin(req) ? "" : "WHERE employee_id = $1";
    const values = isAdmin(req) ? [] : [req.session.user.employee_id];
    const result = await db.query(
      `SELECT
         ticket_id,
         user_name,
         asset_tag,
         ticket_type,
         problem,
         problem_description,
         priority,
         status,
         created_at
       FROM tickets
       ${employeeFilter}
       ORDER BY created_at DESC, ticket_id DESC`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /tickets error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.patch("/tickets/:ticketId/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const ticketId = Number.parseInt(req.params.ticketId, 10);
    const status = req.body.status?.trim();
    const allowedStatuses = new Set(["new", "inprogress", "resolved"]);

    if (!Number.isInteger(ticketId)) {
      return res.status(400).json({ error: "Invalid ticket id" });
    }

    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid ticket status" });
    }

    const updated = await db.query(
      "UPDATE tickets SET status = $1 WHERE ticket_id = $2 RETURNING ticket_id, status",
      [status, ticketId]
    );

    if (updated.rowCount === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error("PATCH /tickets/:ticketId/status error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/tickets/:ticketId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const ticketId = Number.parseInt(req.params.ticketId, 10);

    if (!Number.isInteger(ticketId)) {
      return res.status(400).json({ error: "Invalid ticket id" });
    }

    const deleted = await db.query(
      "DELETE FROM tickets WHERE ticket_id = $1 RETURNING ticket_id",
      [ticketId]
    );

    if (deleted.rowCount === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json({ message: "Ticket deleted", ticket_id: deleted.rows[0].ticket_id });
  } catch (err) {
    console.error("DELETE /tickets/:ticketId error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/tickets", requireAuth, async (req, res) => {
  try {
    const requestedUser = req.body.user?.trim();
    const machine = req.body.machine?.trim();
    const ticketType = req.body.ticketType?.trim();
    const problem = req.body.problem?.trim();
    const problemDescription = req.body.problemDescription?.trim() ?? "";

    const allowedTicketTypes = new Set(["contact", "hardware_problem", "software_problem"]);

    if (!machine || !ticketType || !problem || (isAdmin(req) && !requestedUser)) {
      return res.status(400).json({ error: "User, machine, ticket type, and problem are required" });
    }

    if (!allowedTicketTypes.has(ticketType)) {
      return res.status(400).json({ error: "Invalid ticket type" });
    }

    if (!isAdmin(req) && !req.session.user.employee_id) {
      return res.status(403).json({ error: "This login is not linked to an employee" });
    }

    const assignment = isAdmin(req)
      ? await findAssignedMachine(requestedUser, machine)
      : await findEmployeeMachine(req.session.user.employee_id, machine);

    if (!assignment) {
      return res.status(403).json({
        error: "That machine is not assigned to this user",
      });
    }

    const priority = getPriority(`${problem} ${problemDescription}`);
    const created = await db.query(
      `INSERT INTO tickets (
         employee_id,
         machine_id,
         user_name,
         asset_tag,
         ticket_type,
         problem,
         problem_description,
         priority
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ticket_id, user_name, asset_tag, ticket_type, problem, problem_description, priority, status, created_at`,
      [
        assignment.employee_id,
        assignment.machine_id,
        assignment.full_name,
        assignment.asset_tag,
        ticketType,
        problem,
        problemDescription,
        priority,
      ]
    );

    res.status(201).json(created.rows[0]);
  } catch (err) {
    console.error("POST /tickets error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3002;

ensureAuthSchema(db)
  .then(() => ensureTicketsTable())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error("Could not prepare tickets table:", err);
    process.exit(1);
  });
