# Ambience

A calm soundscape mixer. Stack YouTube videos as audio layers, each with its own
volume, speed and loop, and blend them into something to work, read or sleep to.

**Live:** https://ambience-mixer.vercel.app

## What it does

- **Layers** — paste any YouTube link or video ID and it becomes a layer with
  independent volume, playback speed (0.25×–2×) and loop.
- **Starter presets** — eight curated four-layer blends (Rainy night, Fireside,
  Corner café, Night train, Dawn chorus, Beneath the surface, The tavern,
  Idling starship). Each follows a bed / body / colour / ghost mixing shape.
- **Saved mixes** — name and store your own blends in `localStorage`.
- **Export / import** — round-trip everything as JSON.
- **Sleep timer** — 15 minutes to 2 hours, with a 30-second fade-out.
- **Visualise (theatre mode)** — fill the screen with any one layer, with dim
  control, a Fit/Fill toggle and a screen wake lock.

Playback speed is used as a mixing tool: YouTube preserves pitch when it changes
rate, so 0.75× or 0.5× lengthens and deepens a layer without sounding slowed —
thunder rolls further away, ice becomes a hull, a clock stops nagging.

## Running it

There is no build step. The entire app is one self-contained `index.html`.

```bash
# any static server works
python -m http.server 8000
# then open http://localhost:8000
```

Opening the file directly with `file://` also mostly works, but the YouTube
iframe API prefers a real origin, so a local server is the better bet.

## Deploying

Vercel serves `index.html` as a static file — no framework, no config, no build.

## Notes

- Audio starts only after your first interaction with the page (browser autoplay
  policy).
- Speed steps in 0.25× increments; that is the finest the YouTube player allows.
- Mixing several videos works best with the screen on. Android may pause
  background audio when the screen sleeps.
- If theatre mode stutters, switch it to **Fit** — it letterboxes instead of
  cropping, which makes YouTube serve a stream sized to the device.
- A preset replaces what is currently playing; save your own blend first if you
  want to keep it.

## Licence

MIT — see [LICENSE](LICENSE).
