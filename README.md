# Pulleys — Vite project

A GCSE simulation showing that work done = force × distance with pulleys. Lift a load with 1–4 pulleys (the single pulley only changes the direction of the force) using your hand and a newton meter, a motor, or hanging weights. The load starts on a scale, the rope has a mark every 10 cm, and a table compares the work done pulling the rope with the work done lifting the load.

## Setup

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

To build for production:

```bash
npm run build
npm run preview
```

## Structure

- `index.html` — Vite entry HTML (loads the fonts and `src/main.jsx`).
- `src/main.jsx` — React root bootstrap.
- `src/App.jsx` — the simulation: physics model, canvas drawing and all React components.
- `src/styles.css` — all styling, with light and dark themes.
- `.github/workflows/deploy.yml` — builds and deploys to GitHub Pages on every push to `main`.

## Things you might want to tweak (top of `src/App.jsx`)

- `LOADS` — the load masses to choose from.
- `MOTOR_V` — how fast the motor pulls the rope.
- `NM` — the newton meter: its range and how far it stretches per newton.
- `X_MAX` — the highest the load can be lifted.

## Deploying to GitHub Pages

1. In `vite.config.js`, `REPO_NAME` is set to `pulleys`. Change it if your repo has a different name.
2. Push this project to a GitHub repo, on branch `main`.
3. In the repo's Settings → Pages, set **Source** to "GitHub Actions".
4. The workflow builds the project and publishes `dist/` on every push to `main`.
