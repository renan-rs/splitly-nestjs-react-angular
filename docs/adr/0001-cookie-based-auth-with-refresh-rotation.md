# 0001 — Cookie-based auth with refresh-token rotation

## Context

Splitly has two SPAs (React, Angular) calling one API. A JWT kept in `localStorage` or
`sessionStorage` is readable by any script on the page, so a single XSS exposes a long-lived credential.
Cookies avoid that, but bring CSRF and session-lifetime concerns.

## Decision

- **Access token**: JWT (HS256, 15 min) in an `httpOnly`, `SameSite=Lax`, `Secure` cookie.
- **Refresh token**: 256-bit opaque random value in an `httpOnly` cookie scoped to `/api/v1/auth`.
  Only its SHA-256 is stored (the input is high-entropy, so a fast hash is enough). Every refresh
  **rotates** it; tokens of one login share a `familyId`.
- **Reuse detection**: presenting an already-rotated token revokes the whole family and answers 401.
- **Grace window (10 s)**: browser tabs share one cookie jar and can send the same refresh token at
  the same time. Without tolerance the loser would look like a thief and log the user out. A token
  rotated less than 10 s ago whose successor is still unused is accepted once more and gets a
  sibling token in the same family. The cost: a stolen token is usable for those 10 s. A thief would
  still be caught as soon as either party uses the token again after the window.
- **CSRF**: signed double-submit (OWASP). `XSRF-TOKEN` = `random.HMAC(CSRF_SECRET, userId|anonymous, random)`,
  echoed in `X-XSRF-TOKEN` on every non-GET request. Binding to the session means a token planted by
  an attacker (e.g. from a sibling subdomain) or taken from another user does not validate.
  The access cookie outlives its JWT so the expired token still identifies the session on `/auth/refresh`.
- **Login timing**: unknown emails are verified against a dummy Argon2id hash, so both failures cost the same.
- **Same site**: in production the frontends reach the API through a reverse proxy / rewrites on their
  own origin, so the cookies are first-party and `SameSite=Lax` is enough. `TRUST_PROXY` makes rate
  limiting see the real client IP behind that proxy.

## Consequences

- No credential is reachable from JavaScript; logout and "log out all" are enforced server-side.
- Frontends must call `GET /auth/csrf` once, echo the cookie in a header, and retry once on 401 via `/auth/refresh`.
- Registration reveals whether an email is taken (409). Avoiding that needs email verification, which is out of scope.
- If a client loses the XSRF cookie while logged in, it must call `GET /auth/csrf` again.
- Cross-site deployments (API on another site) would need `SameSite=None` and are not supported.
