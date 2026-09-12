# Setup checklist

This site is plain static HTML/JS (no build step) — deploy it exactly like your
other GitHub Pages projects. Before it works, you need to create a Firebase
project and wire a few things up. None of this can be done for you from here —
it requires your own Google account and a few clicks in web consoles.

## 1. Create the Firebase project
1. Go to https://console.firebase.google.com and create a new project.
2. In the left sidebar: **Build -> Authentication -> Get started**.
   Enable the **Google** sign-in provider, and set a support email (your own).
3. Still in Authentication: **Settings -> Authorized domains** — add the domain
   your site will be served from (e.g. `lfairclo.github.io`). Google Sign-In
   pop-ups will silently fail if this isn't added.
4. **Build -> Firestore Database -> Create database** (start in production
   mode — the rules below lock it down properly).

## 2. Add your config as GitHub repository secrets
Nothing here gets pasted into a committed file — instead the deploy workflow
(`.github/workflows/deploy.yml`) injects it from GitHub repository secrets
at deploy time. That said, worth knowing: Firebase's *web* config
(`apiKey`, `authDomain`, etc.) isn't actually a traditional secret — it's
designed to be visible in every deployed Firebase web app's source, since
the real access control is your Firestore rules and the authorized-domains
list, not hiding this config. Keeping it out of the repo is still tidy
practice, which is what this does.

In Firebase console: **Project settings (gear icon) -> General -> Your apps
-> Add app -> Web**. Copy the values from the `firebaseConfig` object it
gives you.

In your GitHub repo: **Settings -> Secrets and variables -> Actions -> New
repository secret**, and add each of these (name must match exactly):

| Secret name                     | Value from Firebase config    |
|----------------------------------|-------------------------------|
| `FIREBASE_API_KEY`               | `apiKey`                      |
| `FIREBASE_AUTH_DOMAIN`           | `authDomain`                  |
| `FIREBASE_PROJECT_ID`            | `projectId`                   |
| `FIREBASE_STORAGE_BUCKET`        | `storageBucket`                |
| `FIREBASE_MESSAGING_SENDER_ID`   | `messagingSenderId`           |
| `FIREBASE_APP_ID`                | `appId`                       |
| `ADMIN_EMAIL`                    | your own Google account email |

Then, in your repo: **Settings -> Pages -> Build and deployment -> Source**,
set it to **GitHub Actions** (not "Deploy from a branch" — that mode won't
run the workflow that injects the secrets).

The workflow runs on every push to `main`, generates `shared/firebase-init.js`
from `shared/firebase-init.template.js` with your secrets filled in, and
deploys the result. That generated file is listed in `.gitignore` and is
never committed — it only exists in the deployed build.

**Testing locally without pushing**: copy
`shared/firebase-init.local.example.js` to `shared/firebase-init.js` and
fill in real values by hand. `.gitignore` already excludes that filename,
so it won't get committed as long as you don't rename the example file
itself.

## 3. Paste in the Firestore security rules
In Firebase console: **Firestore Database -> Rules**, replace the contents
with this (swap in your real admin email in both places):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null &&
        (request.auth.uid == userId || request.auth.token.email == "your-email@gmail.com");
      allow create: if request.auth != null && request.auth.uid == userId &&
        request.resource.data.approved == false;
      allow update: if request.auth != null && request.auth.token.email == "your-email@gmail.com";
    }
  }
}
```

What this enforces:
- A signed-in user can create *only their own* profile document, and it must
  start with `approved: false` — they can't self-approve.
- A user can read only their own document. You (the admin email) can read
  and update everyone's.
- Nobody but the admin can flip `approved` to `true`.

I haven't been able to test these rules live (that needs a real project), so
before relying on them, use the **Rules Playground** in the Firebase console
to simulate a normal user trying to read someone else's doc or set
`approved: true` on themselves — both should be denied.

## 4. Add games to the lobby
Edit `games.json` in the repo — it's just a list of `{ "name": ..., "url": ... }`
entries. No code changes needed to add or remove a game.

## 5. Approving people
Once someone signs in for the first time, their account shows up as
"Pending" in `admin.html` (only visible to `ADMIN_EMAIL`). Click Approve
there to let them in.

## How the pieces fit together
- `index.html` — time gate, then Google sign-in, then approval check, then
  redirects to `lobby.html`.
- `lobby.html` — the game picker, built from `games.json`.
- `sorry.html` — shown outside the allowed hours; no login required; checks
  the clock every 15s and bounces you to the lobby once you're back in a
  window.
- `admin.html` — approve/revoke accounts (only for `ADMIN_EMAIL`).
- `shared/` — time-gate, escape-key boss-key, session logic, and
  `firebase-init.template.js` (committed, no real values) used by every
  page above. `shared/firebase-init.js` (real values) is generated by CI
  and gitignored — it never lives in the repo.
- `.github/workflows/deploy.yml` — fills in the template from your repo
  secrets and deploys to GitHub Pages on every push to `main`.

## Known limits (read this before relying on it)
- **Time gate reads the visitor's system clock** — trivially bypassed by
  changing the clock. It's a soft nudge, not enforcement.
- **The escape key can't erase browser history or reliably close a normal
  tab** — browsers block both for security reasons. It redirects and makes
  "back" useless, which is the realistic ceiling for plain JavaScript.
- **The 2-hour session-expiry-on-close** depends on the `pagehide` event
  completing an async sign-out before the tab fully closes. This works the
  large majority of the time but isn't watertight (e.g. a crashed tab won't
  fire it).
