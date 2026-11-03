# Deploying the Blackmon Portal (Render)

The portal is one Node server (`app/`) with a SQLite database and uploaded files on a persistent
disk. `render.yaml` describes the service; these are the steps to put it at
https://portal.blackmontutoring.com.

## 1. Put the code on GitHub
The repository root must be this `blackmon-portal` folder (the app serves `../assets`).
`.env`, `data/` and `blackmon-data.tgz` are git-ignored and must never be committed.

```
cd ~/Desktop/blackmon-portal
git init && git add . && git commit -m "Blackmon Portal"
git remote add origin git@github.com:<account>/blackmon-portal.git
git push -u origin main
```

## 2. Create the service
1. render.com → **New → Blueprint** → connect the GitHub repo. Render reads `render.yaml` and
   creates the **blackmon-portal** web service (Standard plan, Ohio) with a 5 GB disk at `/var/data`.
2. Fill in the secret values it asks for (`sync: false` in render.yaml):
   - `GHL_TOKEN`: the GHL Private Integration token (same as `GHL_TOKEN` in `app/.env`)
   - `ADMIN_PASSWORD`: only used if the database has no Owner yet
   - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`: same as in `app/.env`
3. **Apply**. The first deploy runs `npm ci`, starts `node server.js`, and waits for `/health` to return 200.
4. Until step 4 below, the service answers at `https://blackmon-portal.onrender.com`.

## 3. Move the existing data (parents, invites, signed waivers, uploads, camp content)
On your Mac (safe while the local server runs):
```
cd ~/Desktop/blackmon-portal/app
node scripts/export-data.mjs        # -> blackmon-data.tgz (~100 MB; contains ID proofs, keep it private)
```
Render dashboard → blackmon-portal → **Connect → SSH** (add your SSH key under Account settings first), then:
```
scp -s app/blackmon-data.tgz <service-ssh-address>:/var/data/blackmon-data.tgz
ssh <service-ssh-address>
  cd /var/data && rm -f portal.db portal.db-wal portal.db-shm && tar -xzf blackmon-data.tgz && rm blackmon-data.tgz
```
Then **Manual Deploy → Restart service**. Delete `app/blackmon-data.tgz` from your Mac afterwards.
(Skip this step to start with an empty portal; the Owner is then created from ADMIN_EMAIL / ADMIN_PASSWORD.)

## 4. Domain and HTTPS
1. Render → blackmon-portal → **Settings → Custom Domains**: `portal.blackmontutoring.com` is already
   listed (from render.yaml). Its target is `blackmon-portal.onrender.com` (use what Render shows).
2. Cloudflare (blackmontutoring.com's DNS) → **DNS → Add record**:

   | Type | Name | Target | Proxy status | TTL |
   |---|---|---|---|---|
   | CNAME | `portal` | `blackmon-portal.onrender.com` | **DNS only** (grey cloud) | Auto |

   DNS only lets Render issue the certificate itself. (The domain's CAA records already allow Let's Encrypt.)
3. Back in Render, **Verify**. The certificate is issued automatically within a few minutes; the
   portal then redirects all http:// traffic to https:// and sends HSTS.

## 5. Check it
- `https://portal.blackmontutoring.com/health` → `{"ok":true}`
- Render **Logs** at start-up: "served at https://portal.blackmontutoring.com", "Sign-in codes: emailed
  through GHL", "Auto-invite: on", and no PORTAL_URL warning.
- Send one invite to a test parent (a contact with a Winter Camp 2026 Paid (won) opportunity and your
  own email/phone): admin → Parents → **Resend invite**. Open the link from the email and the SMS on a
  phone, sign in with the 6-digit code.

## Later
- Every `git push` to main redeploys (a few seconds of downtime: one instance because of the disk).
- Back up: Render keeps daily disk snapshots; `node scripts/export-data.mjs` on the server also works.
- `PORTAL_URL` is `https://portal.blackmontutoring.com` everywhere (Render and `app/.env`), so every
  emailed / texted link uses the custom domain. Requests on the `*.onrender.com` address redirect there.
- Run the Mac's local server with `AUTO_INVITE=0` (as in `app/.env`) so only Render sends invites.
