// Channel vocoder built from standard Web Audio nodes (no AudioWorklet).
//
// The recorded sound (the "modulator") loops silently in the background. A
// bank of band-pass filters splits it into frequency bands, and an envelope
// follower per band measures how loud that band is moment to moment. Those
// levels open and close the same bands on the synth (the "carrier"), so the
// synth pulses, talks or beatboxes with the recording's rhythm and tone.
//
// Cost: per band, 4 biquads + 1 waveshaper + 1 low-pass + 2 gains, so ~160
// native nodes for 20 bands. Biquads are a few multiplies per sample, so this
// is a small, steady load, fine on phones.

const BANDS = 20, LOW = 100, HIGH = 8000;
const Q = 5;               // ~1/3-octave bands at 20 bands over 100 Hz-8 kHz
const ENV_HZ = 30;         // envelope smoothing: fast enough for speech and beatbox
const ENV_GAIN = 40;       // each band carries a small share of the recording; this brings the output near the plain synth's level
const XFADE = 0.08;        // seconds, when swapping one recording for another

/**
 * @param ac         AudioContext
 * @param carrierIn  node whose output is the sound to shape (the synth bus)
 * @returns { output, setModulator(buffer|null) }
 */
export function createVocoder(ac, carrierIn) {
  const output = ac.createGain();
  const modBus = ac.createGain();
  const curve = new Float32Array(1025); // waveshaper curve for |x| (full-wave rectifier)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.abs(i / 512 - 1);

  const ratio = Math.pow(HIGH / LOW, 1 / (BANDS - 1));
  for (let b = 0; b < BANDS; b++) {
    const f = LOW * Math.pow(ratio, b);
    const bp = () => { const n = ac.createBiquadFilter(); n.type = "bandpass"; n.frequency.value = f; n.Q.value = Q; return n; };

    // Analysis: modulator band -> |x| -> smoothed envelope -> carrier band's level
    const m1 = bp(), m2 = bp(), rect = ac.createWaveShaper(), env = ac.createBiquadFilter(), envGain = ac.createGain();
    rect.curve = curve;
    env.type = "lowpass"; env.frequency.value = ENV_HZ; env.Q.value = 0.5;
    envGain.gain.value = ENV_GAIN;
    modBus.connect(m1); m1.connect(m2); m2.connect(rect); rect.connect(env); env.connect(envGain);

    // Synthesis: carrier band, its level driven by the envelope
    const c1 = bp(), c2 = bp(), vca = ac.createGain();
    vca.gain.value = 0; // the envelope signal is added to this, so silence when the band is quiet
    carrierIn.connect(c1); c1.connect(c2); c2.connect(vca); vca.connect(output);
    envGain.connect(vca.gain);
  }

  let current = null; // { src, gain }

  /** Loop `buffer` as the modulator, crossfading from the previous one; null stops it. */
  function setModulator(buffer) {
    const t = ac.currentTime;
    if (current) {
      const { src, gain } = current;
      gain.gain.setTargetAtTime(0, t, XFADE / 3);
      try { src.stop(t + XFADE * 2); } catch (e) {}
      src.onended = () => { try { gain.disconnect(); } catch (e) {} };
      current = null;
    }
    if (!buffer) return;
    const src = ac.createBufferSource(), gain = ac.createGain();
    src.buffer = buffer; src.loop = true;
    gain.gain.setValueAtTime(0, t); gain.gain.setTargetAtTime(1, t, XFADE / 3);
    src.connect(gain); gain.connect(modBus);
    src.start(t);
    current = { src, gain };
  }

  return { output, setModulator };
}
