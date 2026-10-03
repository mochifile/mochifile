# Deployment

The site is deployed to Cloudflare by the `Deploy` GitHub Actions workflow
([`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)). Background:
[ADR 0013](../adr/0013-deploy-workers-static-assets-from-github-actions.md).

| Event | Result |
| --- | --- |
| Pull request opened or updated (from this repository) | A Preview at `https://pr-<number>-mochifile.<subdomain>.workers.dev`, linked from the PR ("View deployment") |
| Merge to `main` | Production at `https://mochifile.<subdomain>.workers.dev` |
| Pull request closed or merged | Its Preview is deleted |

Until launch, every deployment is hidden from search engines
([ADR 0014](../adr/0014-block-search-indexing-until-launch.md)).

Wrangler settings live in [`apps/web/wrangler.jsonc`](../../apps/web/wrangler.jsonc). Do not
change Worker settings in the Cloudflare dashboard; the next deploy may overwrite them.

## One-time setup

Done once by a maintainer. It needs a Cloudflare account and admin access to the GitHub
repository. Nothing is created in Cloudflare by hand: the first deploy creates the `mochifile`
Worker.

### 1. Choose your workers.dev subdomain

1. Sign in at <https://dash.cloudflare.com>.
2. In the left sidebar, open **Compute** → **Workers & Pages** (on older layouts: **Workers &
   Pages**).
3. If Cloudflare asks you to choose a **workers.dev subdomain**, pick one (for example
   `mochifile`) and confirm. If it does not ask, you already have one: it is shown in the
   right-hand panel under **Subdomain**.

### 2. Copy your Account ID

1. Still on **Workers & Pages**, find **Account ID** in the right-hand panel.
2. Click **Copy** (or select the 32-character value) and keep it for step 4.

### 3. Create the API token

1. Open <https://dash.cloudflare.com/?to=/:account/api-tokens> (the **Account API Tokens**
   page; also under **Manage Account** → **Account API Tokens**).
2. Click **Create Token**.
3. Next to **Edit Cloudflare Workers**, click **Use template**.
4. Rename the token to `GitHub Actions – mochifile deploy` (pencil icon next to the name).
5. Leave the permission list as the template sets it.
6. Under **Account Resources**: **Include** → your account.
7. Under **Zone Resources**: **Include** → **All zones from an account** → your account.
   (Needed later to attach `mochifile.com`.)
8. Leave **Client IP Address Filtering** empty. Set **TTL** to an end date if you want the
   token to expire, and note it down so you can create a new one before then.
9. Click **Continue to summary**, then **Create Token**.
10. Copy the token right away. Cloudflare shows it only once.

Never paste the token into a file, an issue, a PR or a chat. It only goes into GitHub
secrets.

### 4. Add the two GitHub secrets

1. Open <https://github.com/mochifile/mochifile/settings/secrets/actions> (repository
   **Settings** → **Secrets and variables** → **Actions**).
2. Click **New repository secret**. Name: `CLOUDFLARE_API_TOKEN`. Secret: the token from step 3.
   Click **Add secret**.
3. Click **New repository secret** again. Name: `CLOUDFLARE_ACCOUNT_ID`. Secret: the Account
   ID from step 2. Click **Add secret**.

Names must match exactly, in capital letters.

### 5. Optional: limit production to `main`

The first run creates two GitHub environments, `preview` and `production`. To ensure only
`main` can deploy production:

1. Open repository **Settings** → **Environments** → **production**.
2. Under **Deployment branches and tags**, choose **Selected branches and tags**, click **Add
   deployment branch or tag rule**, type `main`, and save.

### 6. Check it works

1. Open any pull request from this repository → **Checks** → **Deploy**. If it failed with
   "Add the CLOUDFLARE_API_TOKEN…", click **Re-run all jobs**.
2. When **Preview** turns green, the PR shows **View deployment**. It opens the Preview.
3. After the next merge to `main`, **Actions** → **Deploy** → **Production** shows the
   production URL in its log.

## Rotating the token

Create a new token (step 3), replace the `CLOUDFLARE_API_TOKEN` secret (step 4, **Update**),
re-run a Deploy job to confirm, then delete the old token on the Account API Tokens page.

## Troubleshooting

- **Preview job skipped:** pull requests from forks get no secrets, so they get no Preview.
  CI still runs.
- **"Authentication error" / code 10000:** the token is wrong, expired, or scoped to another
  account. Recreate it (step 3).
- **"You need to register a workers.dev subdomain":** do step 1.
