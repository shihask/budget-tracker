# AA Discovery Spike — API call log

Auto-appended by `lib/setu-client.mjs`. Each entry: timestamp, method, URL,
status, duration, and rate-limit/retry headers if present. Never logs auth
secrets, only the token's presence.
- 2026-07-13T07:51:52.829Z — POST https://uat.setu.co/api/v2/auth/token
  status: 200, duration: 436ms
- 2026-07-13T07:51:53.184Z — POST https://fiu-sandbox.setu.co/consents
  status: 401, duration: 350ms
- 2026-07-13T08:49:56.883Z — POST https://orgservice-prod.setu.co/v1/users/login
  status: 200, duration: 509ms
- 2026-07-13T08:49:57.203Z — POST https://fiu-sandbox.setu.co/consents
  status: 401, duration: 316ms
- 2026-07-13T11:34:12.090Z — POST https://orgservice-prod.setu.co/v1/users/login
  status: 200, duration: 362ms
- 2026-07-13T11:34:12.472Z — POST https://fiu-sandbox.setu.co/v2/consents
  status: 400, duration: 377ms
- 2026-07-13T11:38:43.327Z — POST https://orgservice-prod.setu.co/v1/users/login
  status: 200, duration: 339ms
- 2026-07-13T11:38:43.671Z — POST https://fiu-sandbox.setu.co/v2/consents
  status: 400, duration: 339ms
- 2026-07-13T11:39:16.956Z — POST https://orgservice-prod.setu.co/v1/users/login
  status: 200, duration: 232ms
- 2026-07-13T11:39:17.348Z — POST https://fiu-sandbox.setu.co/v2/consents
  status: 201, duration: 388ms
- 2026-07-13T12:10:32.543Z — POST https://orgservice-prod.setu.co/v1/users/login
  status: 200, duration: 346ms
- 2026-07-13T12:10:32.798Z — POST https://fiu-sandbox.setu.co/v2/sessions
  status: 400, duration: 251ms
- 2026-07-13T12:11:02.183Z — POST https://orgservice-prod.setu.co/v1/users/login
  status: 200, duration: 261ms
- 2026-07-13T12:11:02.392Z — POST https://fiu-sandbox.setu.co/v2/sessions
  status: 400, duration: 202ms
- 2026-07-13T12:11:27.276Z — POST https://orgservice-prod.setu.co/v1/users/login
  status: 200, duration: 265ms
- 2026-07-13T12:11:27.777Z — POST https://fiu-sandbox.setu.co/v2/sessions
  status: 201, duration: 495ms
- 2026-07-13T12:11:30.852Z — GET https://fiu-sandbox.setu.co/v2/FI/fetch/b424274b-cd07-4b4a-9e44-aae72f793a3c
  status: 404, duration: 54ms
- 2026-07-13T12:14:03.702Z — POST https://orgservice-prod.setu.co/v1/users/login
  status: 200, duration: 262ms
- 2026-07-13T12:14:04.131Z — POST https://fiu-sandbox.setu.co/v2/sessions
  status: 400, duration: 425ms
