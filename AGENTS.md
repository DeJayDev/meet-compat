# AGENTS.md

Guidance for coding agents working in this repository.

## Commands

- `npx web-ext run`: Firefox with a fresh profile and the extension loaded
- `npx web-ext lint`: run after every change
- `npx web-ext build --overwrite-dest`: zip in `web-ext-artifacts/` for the AMO Developer Hub (source code "No")
- `rsvg-convert -w 128 -h 128 icons/icon.svg -o icons/icon-128.png`: regenerate an icon PNG after editing `icons/icon.svg` (same for 48 and 96)

There is no build step and no test suite. A release needs a new `version` in `manifest.json`, since AMO won't sign a version twice. Keep `strict_min_version` at 142 or later: `data_collection_permissions` arrived in Firefox 140 (Android 142), and AMO warns on anything lower. Keep the add-on ID `meet-room-checkin@dejaydev`; it predates the rename, and a new ID makes AMO treat the upload as a different add-on.

## Architecture

Two scripts, no dependencies.

`background.js` rewrites `User-Agent` to Chrome and adds `Sec-CH-UA*` on requests to meet.google.com, and on `*.clients6.google.com` requests whose `originUrl` is a Meet page. The platform token follows the real OS; the Chrome major is 157 as of 2026-11-19 plus one every 28 days. This is what turns on Meet's Chrome-only features. Meet serving its Blink stylesheet (`_F_cssRowKey` ending `.L.B1.O`; Firefox gets `.L.F4.O`) shows the rewrite reached the server. Don't rely on `navigator.userAgent`: a fresh profile's first Meet load got the Chrome string, while a profile that had used Meet before kept Firefox's.

`raw-microphone.js` runs in the page's main world at `document_start` and wraps:
- `getUserMedia`: audio goes out with echo cancellation, noise suppression and AGC off; what Meet asked for is remembered per track.
- `MediaStreamTrack.clone` and `MediaStream.clone`: clones of tracked tracks go back to unprocessed and are tracked too.
- `applyConstraints` on a tracked track: processing stays off and the requested values are remembered.
- `RTCPeerConnection.addTrack`, `addTransceiver` and `RTCRtpSender.replaceTrack`: the first audio track attached means the call started, so every live tracked track gets its requested processing back, and wrapping stops until the next `getUserMedia`.

It logs one `[meet-compat]:` line when it pauses processing and one when it restores it. Keep both; they're how users see it working.

Why: Meet opens a raw stream for its room code decoder and a processed one for the call. Firefox processes a mic once for every track on it: one track with any processing makes cubeb open the device with `prefs VOICE`, which strips the 17–22 kHz band from every stream, raw ones included. The room signal measured 19.6–19.9 kHz. Meet also clones the call track and then clones the clone, and Firefox gives the second clone aec/agc/noise while `getSettings()` reports them off.

## Debugging

- Firefox logs: `timestamp,cubeb:5,MediaManager:5`. On the join screen every `Mic source ... Audio config` line reads `aec: off` and the input opens with `prefs 0x0`; `prefs VOICE` before Join now means the band is gone. After Join now the call streams read `aec: on`, Meet's raw stream stays off, and `prefs VOICE` is expected. In testing, `about:logging` captured only cubeb; MediaManager lines come from the content process and need `MOZ_LOG`/`MOZ_LOG_FILE` set when Firefox launches.
- Band check: an `AnalyserNode` (fftSize 8192) on a raw stream while an 18.5 kHz tone plays. A 17–22 kHz median near −100 dB is healthy; −170 dB or lower means voice processing.
- Meet's decoder is the WebAssembly module `loadAudioAnalyzer` in the AudioWorklet `audio-analyzer-processor`, and it reads only input 1 (raw capture). Posting `generateProbeSignal` to its port returns a probe it can decode, which can be played from the laptop speaker instead of a room. Meet's logs never reach the console: its logger objects (`name`, `withError`, `log`) sit on `window.default_MeetingsDesktopUi_default`, and a backend added to their manager's `Set` sees every entry. Success is `Room out-of-call signal detected` from `local_audio_analyzer_delegate`.
- Ruled out: Firefox's 128-frame render quantum (Chrome runs Meet at 1024), AudioWorklet message timing, the analyzer's "Capture muted" flag, saved site permission, WebRTC playback, `media.cubeb.output_voice_routing`.

Don't turn off `media.getusermedia.microphone.prefer_voice_stream_with_processing.enabled` or `voice_stream_priming.enabled`: `AudioContext.resume()` never resolved with them off.
