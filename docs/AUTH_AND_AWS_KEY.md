# Auth and AWS key setup

## 1. Rotate the leaked AWS key (do this first, by hand)

The access key that was in `.env` as `REACT_APP_AWS_ACCESS_KEY_ID`, in `server/.env`, in `.env.scripts`, and inside the 6 Sep `build/` bundle is the same key. Treat it as public.

1. In the AWS console, IAM → Users → the user that owns that key → Security credentials → **Deactivate** the old key (keep it deactivated for a day so a missed consumer fails loudly, then delete it).
2. Create a new IAM user `pts-api` with **no console access** and attach the inline policy below (scoped to `PTSProd` and its indexes only).
3. Create one access key for `pts-api`. Put it in `server/.env` as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. Nothing in the frontend should ever hold an AWS key again (`.env` no longer has `REACT_APP_AWS_*`, and `aws-sdk` is gone from the frontend `package.json`).
4. For the maintenance scripts in `server/scripts`, either reuse the `pts-api` key in `.env.scripts` or make a second user with the same policy. Delete `.env.scripts` when not in use.
5. Delete the stale `build/` folder (`rm -rf build`) and rebuild before deploying. Search any host you ever uploaded a build to and replace it.
6. Turn on point-in-time recovery and deletion protection on `PTSProd` (DynamoDB → table → Backups / Additional settings).

### Inline policy for `pts-api`

Replace `123456789012` with the account ID.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PtsProdTable",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem",
        "dynamodb:Query",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:123456789012:table/PTSProd",
        "arn:aws:dynamodb:us-east-1:123456789012:table/PTSProd/index/*"
      ]
    }
  ]
}
```

No `Scan`, no `ListTables`, no access to `PTS` / `PTSDev` in us-east-2, no IAM rights.

## 2. Server auth

Passwords are hashed with bcrypt and stored on a separate `USER#<id>` / `AUTH` item, never on the profile item (the profile is returned to other users). Sessions are JWTs signed by the server, 30 days by default.

New environment variables for `server/.env`:

| Variable | Required | Meaning |
|---|---|---|
| `PTS_JWT_SECRET` | yes in production | Long random string. Generate with `openssl rand -hex 48`. Changing it signs everyone out. Without it in development a random one is used per start. |
| `PTS_ADMIN_USER_IDS` | no | Comma-separated userIDs allowed to call `/api/_table`, `/api/batchWrite`, `/api/admin/*` and to act on other users. |
| `PTS_ALLOW_LEGACY_CLAIM` | no | `true` lets a pre-auth profile (no `AUTH` item) be claimed by whoever first signs up with that username. Turn on only during the migration window for existing testers, then off. |
| `PTS_TOKEN_TTL` | no | Token lifetime, default `30d`. |

Routes:

- `POST /api/auth/signup` `{username, password}` → `{token, user, profileExists}`. The client then creates the profile with `POST /api/user` when `profileExists` is false.
- `POST /api/auth/signin` `{username, password}` → `{token, user}`.
- `GET /api/auth/me` → the token's profile (used to restore a session on reload).
- `POST /api/auth/password` `{currentPassword, newPassword}`.

Every other `/api` route requires `Authorization: Bearer <token>`. The notification stream takes `?token=` because `EventSource` cannot send headers.

Enforcement, in `server/lib/auth.js`:

- Body fields `userID`, `senderID`, `hostID`, `authorID`, `createdBy`, `ownerID` must match the token (or be empty, in which case they are filled from it). Routes keep reading `req.body.userID` unchanged.
- Any route with a `:userID` segment: mutations must be the caller's own user. GETs are open to signed-in users (profiles, posts, sessions, solves and stats are shown on friends' profiles) except the private ones: notifications stream, import jobs, conversations, groups list.
- `GET /api/messages/:conversationID` and `GET /api/groupPosts/:groupID` always check membership of the token user.
- `POST /api/user` refuses to overwrite an existing profile.

Client side: `src/services/auth.js` stores the token in `localStorage` (`pts.authToken`), `src/services/api.js` attaches it, and a 401 with `code: "UNAUTHENTICATED"` clears it and signs the app out.

## 3. Existing accounts

Profiles created before this change have no password. Two options:

- Set `PTS_ALLOW_LEGACY_CLAIM=true` for a short window, tell existing testers to "Sign up" with their old username to set a password, then set it back to `false`.
- Or create `AUTH` items for them yourself with a script and send them temporary passwords.

Until an account has an `AUTH` item, sign-in returns 401 with `code: "LEGACY_ACCOUNT"`.
