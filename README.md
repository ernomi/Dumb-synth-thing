# Pocket Wizard

Point the camera at things. Things become sound.

## Layout

```
index.html              markup
css/styles.css          styling and theme tokens
js/
  main.js               app state, frame loop, event wiring
  util.js               clamp, smoothstep
  mapping.js            shape features -> pitch, timbre, drive, distance   (pure)
  tracking.js           matches objects across frames and smooths them     (pure)
  analysis/
    detect.js           shape detection on raw RGBA pixels                 (pure)
    geometry.js         hulls, areas, masks                                (pure)
    color.js            hue / warmth / overdrive from a color              (pure)
    image.js            draws a video/image to a small canvas and runs detect
  audio/
    engine.js           Web Audio synth: voices, reverb, scene-tone EQ, limiter
    unlock.js           mobile/iOS audio unlock workarounds
  ui/
    settings.js         reads the settings panel controls
    render.js           overlay, oscilloscope, voice list, scene text
    theme.js            colors from CSS custom properties
  sources/
    camera.js           live camera and wake lock
    image-file.js       load photos (EXIF rotation, HEIC message)
    sample.js           built-in sample scene
  recording/
    compose.js          draws the vertical 9:16 frame that gets recorded
    recorder.js         canvas + synth audio -> MP4 (or WebM) via MediaRecorder
    finalize.js         rewrites the recording as a standard MP4 with the right length
    share.js            names the file and opens the phone's share sheet
  vendor/
    mediabunny-1.62.1.min.mjs   MP4 remuxing (MPL-2.0, see mediabunny-LICENSE.txt);
                                pinned, loaded only after a recording finishes
```

Modules marked *pure* don't touch the DOM, so they can be unit-tested in Node.
