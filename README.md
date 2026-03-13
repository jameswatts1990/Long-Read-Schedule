# Long Read Schedule

## Running locally

- Development (Vite middleware + HMR):
  - `npm run dev`

## Running in production

Use the compiled production build and static assets (no Vite dev middleware):

1. Build assets and server bundle:
   - `npm run build`
2. Start production server:
   - `npm run start`

Production uses `NODE_ENV=production` and serves the client from `dist/public`.
