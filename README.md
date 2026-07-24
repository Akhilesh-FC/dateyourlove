# DateYourLove (demo)

Simple Tinder-like demo using Node.js, Express, Socket.io and MySQL.

Setup

1. Copy `.env.example` to `.env` and edit DB credentials.

2. Create the database and tables by running the SQL in `migrations/schema.sql`:

```bash
mysql -u root -p < migrations/schema.sql
```

3. Install dependencies:

```bash
npm install
```

4. Run the server:

```bash
npm run dev
```

5. Open `http://localhost:3000` and use the simple UI to connect, send likes and messages.

API Endpoints

- `POST /api/otp/send` — request OTP with `{ mobile }`
- `POST /api/otp/verify` — verify OTP with `{ mobile, otp }`
- `POST /api/users/profile` — update profile with required fields
- `GET /api/users` — list users
- `GET /api/users/:id` — get user details

All API requests must include a bearer token header:

```http
Authorization: Bearer your_bearer_token_here
```

Notes

- This is a minimal demo scaffold. Add authentication, validation, error handling, and production hardening before using it in production.
