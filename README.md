# IT Ticket Dashboard

A small IT support dashboard built with vanilla JavaScript, Express, and PostgreSQL.

## Features

- Employee and administrator accounts with scrypt-hashed passwords
- Server-enforced ticket ownership for employees
- Administrator access to all tickets, status changes, and deletion
- Ticket creation limited to machines assigned to the selected employee
- Automatic priority assignment from the reported problem
- Ticket type, status, priority, and search filters

## Requirements

- Node.js 20 or newer
- PostgreSQL

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a PostgreSQL database and initialize the core tables:

   ```bash
   createdb ticket_website
   psql -d ticket_website -f database/schema.sql
   ```

3. Add employee and machine records to the database. Each machine should reference its assigned employee.

4. Set the database connection variables shown in `.env.example`. The app reads them from the shell environment; it does not load `.env` automatically.

5. Create login accounts for employees:

   ```bash
   npm run provision-users
   ```

   This writes generated credentials to `employee-login-credentials.csv`. The file is ignored by Git and blocked from HTTP access by the server.

6. Start the application:

   ```bash
   npm start
   ```

Open `http://localhost:3002`.

## Access Rules

- Employees can view and create tickets only for themselves and their assigned machines.
- Administrators can view all tickets, create tickets for any assigned employee, update statuses, and delete tickets.
- Employees without an assigned machine can log in, but cannot create a ticket until a machine is assigned.
