CREATE TABLE IF NOT EXISTS employees (
  employee_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS machines (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_tag VARCHAR(255) NOT NULL UNIQUE,
  serial_number VARCHAR(255) NOT NULL UNIQUE,
  brand VARCHAR(255),
  model VARCHAR(255),
  machine_type VARCHAR(255),
  form_factor VARCHAR(255),
  operating_system VARCHAR(255),
  cpu VARCHAR(255),
  ram_gb INTEGER,
  storage_gb INTEGER,
  storage_type VARCHAR(255),
  gpu VARCHAR(255),
  screen VARCHAR(255),
  purchase_date DATE,
  warranty_expiry DATE,
  department VARCHAR(255),
  site VARCHAR(255),
  machine_status VARCHAR(255),
  machine_condition VARCHAR(255),
  employee_id INTEGER REFERENCES employees(employee_id)
);

CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  employee_id INTEGER REFERENCES employees(employee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_unique
ON users(employee_id)
WHERE employee_id IS NOT NULL;
