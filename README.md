Society & Sustainability

# What changed

Pages change. Most diffs are noise. **What changed** keeps the useful part.

[Open the live monitor](https://whatchanged-tracker.vercel.app) · [Watch the presentation](./media/whatchanged-presentation.mp4)

## In one minute

Add a public URL and choose how often it should be checked. The app saves a clean snapshot, compares it with the next version, and highlights changes that a person would actually care about: a new price, a removed condition, an updated deadline, or a changed plan.

## What is included

- URL validation and protection from private-network requests
- scheduled and manual checks
- cleaned snapshots with scripts disabled
- side-by-side and raw-diff views
- a short human-readable summary
- local watch history in the browser

## Try it locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, add a public page, then use **Check now** after its content changes.

## The pipeline

```text
public URL → safe fetch → clean snapshot → compare → explain → save
```

The monitor deliberately does not sign into private accounts or execute page scripts. It is aimed at public pricing, policy, course, and product pages where a compact explanation is more useful than a wall of HTML.
