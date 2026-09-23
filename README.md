# Ambience

[![verify](https://github.com/steverowley/ambience-mixer/actions/workflows/verify.yml/badge.svg)](https://github.com/steverowley/ambience-mixer/actions/workflows/verify.yml)

A calm soundscape mixer. Stack YouTube videos as audio layers, each with its own
volume, speed and loop, and blend them into something to work, read or sleep to.

**Live:** https://ambience-mixer.vercel.app

## What it does

- **Built-in sounds** — seven sources synthesised in the browser with Web Audio:
  rain, waves, wind, stream, brown noise, pink noise and a drone. Nothing is
  downloaded, so they cost no bandwidth, work offline, and keep playing when the
  screen sleeps. Each has a **Tone** control in place of Speed.
- **YouTube layers** — paste any link or video ID for anything the built-ins
  don't cover, with independent volume, playback speed (0.25×–2×) and loop.
- **Mute and solo** per layer, without losing the level you set.
- **Starter presets** — eight curated four-layer blends (Rainy night, Fireside,
  Corner café, Night train, Dawn chorus, Beneath the surface, The tavern,
  Idling starship). Each follows a bed / body / colour / ghost mixing shape.
- **Saved mixes** — name and store your own blends in `localStorage`.
- **Share** — a link carries the whole soundscape in its hash.
- **Export / import** — round-trip everything as JSON.
- **Sleep timer** — 15 minutes to 2 hours, with a 30-second fade-out.
- **Visualise (theatre mode)** — fill the screen with any one video layer, with
  dim control, a Fit/Fill toggle and a screen wake lock.
- **Lock-screen controls** via the Media Session API, and a keep-awake switch.

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

## Development

No build step. The app is one self-contained `index.html`.

```bash
python -m http.server 8000      # then open http://localhost:8000
node .dev/verify.js             # run the test suite
python .dev/subset_font.py      # regenerate the Fraunces subset
python .dev/make_icons.py       # regenerate the PWA icon set
```

`.dev/verify.js` executes the app's real IIFE in a stub DOM and asserts on
behaviour (volume maths, share round-trip, import validation, mute/solo, XSS
resistance) as well as the source itself. It has no dependencies — plain Node.

## Licence

**Copyright © 2026 Stephen Rowley. All rights reserved.**

This is proprietary software, not open source. The code is publicly visible
for reference only — viewing it grants you no licence to use, copy, modify,
host or distribute it. See [LICENSE](LICENSE) for the full terms, and contact
the owner for any licensing enquiry.
