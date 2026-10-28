# Scholars Syndicate

A journey guide for students — from secondary school, through exams (JAMB, WAEC, NECO, Post-UTME),
to admission and university life. This is the rebuilt foundation: one project holding the website,
the server, and the code they share.

```
apps/web         the website (React + Vite, mobile-first)
apps/api         the server (Node + Express 5 + PostgreSQL)
packages/shared  code both sides use (e.g. the shape of API responses)
docs/            planning notes (FEATURES.md = everything the old app did)
PROGRESS.md      what is done, what was tested, what is next  ← read this too
```

Everything used here is free and open source.

---

# Start here — Windows, step by step

You do this **once**. It takes about 30–40 minutes, mostly waiting for installers.
After each step there is a **✅ You should see** line. If you do not see it, stop and fix that step
before moving on (see "If something goes wrong" at the end).

> **Use "Command Prompt", not "PowerShell".** PowerShell sometimes blocks `npm` with a red
> "running scripts is disabled" message. Command Prompt does not have that problem.

## Step 1 — Install Node.js (runs the project)

1. Go to **https://nodejs.org**. Download the **LTS** version (the Windows Installer `.msi`, version **24 or higher**).
2. Open the downloaded file. Click **Next** on every screen (leave all options as they are), then **Install**, then **Finish**.
   If a screen offers to install **"tools for native modules"** (Chocolatey / Visual Studio Build Tools), leave it **unticked** — it downloads several gigabytes and this project does not need it.
3. Check it worked: press the **Windows key**, type `cmd`, press **Enter**. A black window opens. Type:
   ```
   node -v
   ```
   and press **Enter**.

✅ **You should see** something like `v24.11.0` (any number starting with 24 or higher).
If it says "'node' is not recognized", close the black window, open a new one and try again; if it still fails, restart the computer.

## Step 2 — Install PostgreSQL (the database)

1. Go to **https://www.postgresql.org/download/windows/** and click **Download the installer**.
2. Pick the newest version offered (16 or higher) for **Windows x86-64** and download it.
3. Open the installer and click **Next** through the screens. Leave the folder, the ticked components
   (PostgreSQL Server, pgAdmin 4, Command Line Tools) and the port (**5432**) exactly as they are.
4. **Important:** one screen asks for a **password for the database superuser (postgres)**. Type a
   password you will remember and **write it down**. It only protects your own laptop.
5. Keep clicking **Next**, then **Install**. At the end, untick "Launch Stack Builder" and click **Finish**.

✅ **You should see** "PostgreSQL" and "pgAdmin 4" in your Start menu.

## Step 3 — Create the two databases

You need one database for development and one for tests.

1. Press the **Windows key**, type `pgAdmin 4`, press **Enter**. (The first time it may ask you to set a
   "master password" — choose anything; that is only for pgAdmin itself.)
2. In the left panel, click **Servers**, then click **PostgreSQL 16** (or your version). Enter the
   **postgres password** from Step 2 when asked.
3. Click **Databases**, then right-click the database named **postgres** and choose **Query Tool**.
   A big empty text box opens.
4. Run these **one at a time**. Paste the **first line**, press the ▶ (**Execute**) button at the top (or **F5**),
   wait for the green message, then **delete the text** and paste the next line:

   ```sql
   CREATE ROLE scholars WITH LOGIN PASSWORD 'scholars' CREATEDB;
   ```

   ```sql
   CREATE DATABASE scholars_dev OWNER scholars;
   ```

   ```sql
   CREATE DATABASE scholars_test OWNER scholars;
   ```

✅ **You should see**, after each one, a green message such as "CREATE ROLE" / "CREATE DATABASE" /
"Query returned successfully". (Never put real student data in `scholars_test` — it gets wiped.)

## Step 4 — Put the project in a folder and install it

1. Unzip `scholars-syndicate.zip` into a simple folder such as `C:\Projects\scholars-syndicate`
   (right-click the zip → **Extract All…**). Avoid very long folder paths.
2. Open that folder in **File Explorer** (you should see `package.json`, `README.md`, `apps` …).
3. Click on the **address bar** at the top of File Explorer (where the folder path is), type `cmd`, and press **Enter**.
   A black window opens **already inside the project folder**.
4. In the black window type this and press **Enter**:
   ```
   npm install
   ```
   Wait 1–3 minutes. Yellow "warn" lines are normal and can be ignored.

✅ **You should see** it finish with a line like `added 428 packages` and **no red "npm error"**.

## Step 5 — Create your settings file

In the same black window:

```
copy apps\api\.env.example apps\api\.env
```

✅ **You should see** `1 file(s) copied.`

You do **not** need to edit anything if you used the names and passwords exactly as in Step 3.
(If you chose different ones, open `apps\api\.env` in Notepad and change `DATABASE_URL` and
`TEST_DATABASE_URL` to match.)

## Step 6 — Build the database tables

```
npm run db:migrate
```

✅ **You should see** `✅ Database is up to date.`

## Step 7 — Start the project

You need **two** black windows open at the same time.

**Window 1** (the one you already have, inside the project folder):

```
npm run dev:api
```

✅ **You should see** `🚀 API v0.1.0 listening on http://localhost:4000`. Leave this window open.

**Window 2** — open a new one the same way as in Step 4 (File Explorer address bar → type `cmd` → Enter), then:

```
npm run dev:web
```

✅ **You should see** a line `Local: http://localhost:5173/`.

Now open **Google Chrome** and go to **http://localhost:5173**.

✅ **You should see** "Scholars Syndicate" and a green **"Connected — everything is working."**

To stop the project later: click each black window and press **Ctrl + C**.
Next time, you only need Step 7 (Steps 1–6 are one-time).

## Step 8 — Run the tests (recommended)

Stop the two windows first (Ctrl + C), or open a third one, then:

```
npm test
```

✅ **You should see** `16 passed` (server) and `5 passed` (website).

## Step 9 — Switch on Google sign-in (after the sign-in update)

Follow **`docs/GOOGLE_SETUP.md`**: it shows how to put your Google Client ID in `apps\api\.env`, how to restart, and what
every error message means.

## If something goes wrong

| What you see                                                | What it means / what to do                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `'node' is not recognized` or `'npm' is not recognized`     | Node is not installed or the window is old. Close all black windows, open a new one. Still failing: restart the computer.          |
| `running scripts is disabled` (red, in PowerShell)          | You used PowerShell. Use **Command Prompt** (`cmd`) instead.                                                                       |
| Red `npm error` during `npm install`                        | Copy the red text and send it to me. Check your internet connection and try again.                                                 |
| `ECONNREFUSED ... 5432`                                     | PostgreSQL is not running. Press Windows key → type `Services` → find **postgresql-x64-16** → right-click → **Start**. Then retry. |
| `password authentication failed for user "scholars"`        | The role was not created with the password `scholars`. Redo Step 3, or fix the password in `apps\api\.env`.                        |
| `database "scholars_dev" does not exist`                    | Step 3 was skipped or a line failed. Redo that line.                                                                               |
| `ECONNREFUSED` but PostgreSQL _is_ running                  | In `apps\api\.env`, change `localhost` to `127.0.0.1` in both database lines, save, and retry.                                     |
| Page says **"Cannot reach the server."**                    | Window 1 (`npm run dev:api`) is not running or shows a red error. Start it, then click **Check again** on the page.                |
| Page says **"Server reachable, but the database is down."** | PostgreSQL is stopped or the settings in `.env` are wrong (see the rows above).                                                    |
| `EADDRINUSE` / "port already in use"                        | Another copy is still running. Close all black windows and start again.                                                            |

---

# Reference

## Everyday commands

| Command                     | What it does                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run dev:api`           | Starts the server                                                                        |
| `npm run dev:web`           | Starts the website                                                                       |
| `npm test`                  | Runs all tests (needs the `scholars_test` database)                                      |
| `npm run typecheck`         | Checks the TypeScript for mistakes                                                       |
| `npm run lint`              | Checks code quality                                                                      |
| `npm run format`            | Tidies code formatting                                                                   |
| `npm run build`             | Builds the server and website for production                                             |
| `npm run db:generate`       | After editing `apps/api/src/db/schema.ts`: writes a new migration file                   |
| `npm run db:migrate`        | Applies any new migrations to your dev database                                          |
| `npm run db:reset -- --yes` | **Deletes** the dev database and rebuilds it from migrations (never works in production) |

## How the database stays rebuildable

The database structure is defined **in code** (`apps/api/src/db/schema.ts`). To change it:

1. Edit `schema.ts`.
2. `npm run db:generate` → creates a new `.sql` file in `apps/api/drizzle/`.
3. Commit that file. `npm run db:migrate` applies it.

Never change tables by hand in a database tool — if it is not in a migration file, it can be lost.
The tests prove the rule: they rebuild the database from empty using only the migration files.

## Safety notes

- Tests delete everything in `TEST_DATABASE_URL`. The code refuses to run unless that database's
  name ends in `_test`.
- `.env` files hold secrets and are never committed (they are in `.gitignore`).

## Other ways to get a database (free)

Instead of installing PostgreSQL, you can use a free hosted one such as Neon: create a project, copy its
connection string into `DATABASE_URL` in `apps/api/.env`, create a second database whose name ends in
`_test`, and put its connection string in `TEST_DATABASE_URL`. Free-plan limits can change, so check
their current terms.

## Version notes

- **Node 24 or higher is required.** `.nvmrc`, `package.json` and `.npmrc` enforce it, so an older Node
  stops with a clear message instead of failing in confusing ways. (Older Node versions ship an npm with a
  bug that breaks installing the current test tool.)
- The automatic checks (GitHub Actions) also fail if a new **high or critical** security vulnerability
  appears in the packages we use (`npm audit --audit-level=high`).
