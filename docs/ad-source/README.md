# PickleLive ad (36 s, voice + captions)

Output: `docs/picklelive-ad.mp4` (1920×1080, H.264 + AAC).

How it's made:
1. **Showcase page:** `ad.html` + `ad.js` are copied into `dist/client/`, so they're served from the same origin as the app; that lets the iframes run the live app. The page has device mockups (TV, phone, tablet, laptop) and times its scenes and captions to the voiceover.
2. **Recording:** `rec.cjs` (Playwright) logs in, loads the live app pages into each device, and starts the timeline. While recording it scores rallies through the referee API and taps the real referee screen. It needs a running server with seed data (`npm run db:seed && npm start`).
3. **Voiceover:** ElevenLabs, voice "Kaanha – Confident Commercial Voiceover", model eleven_v4.
4. **Mux:** ffmpeg trims to the timeline start, delays the voice by 0.6 s, applies loudnorm and fades.
