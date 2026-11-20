# meet-compat

Meet Compatibility for Firefox allows Google Meet features limited to Chrome users to work in Firefox. Meet's servers see Chrome, so Meet turns on the features it keeps for Chrome, including automatic room check-in: in a room with Meet hardware, the join screen detects the room and offers to connect it.

Unofficial: not made or supported by Google.

## Install

Available on AMO soon.

## How it works

`background.js` sends Chrome's user agent and client hints on requests to meet.google.com and on the `*.clients6.google.com` calls a Meet tab makes, so Meet's servers treat Firefox as Chrome.

Room check-in needed one more fix. Meet opens two `getUserMedia` streams: a raw one for the room code decoder, and one with echo cancellation, noise suppression and AGC for the call. Firefox processes a mic once for every track on it, so the processed request puts the whole device through the OS's voice processing, which strips the 17–22 kHz band the room code sits in from the raw stream too. Turning processing off on the call stream isn't enough: Meet clones that track, then clones the clone, and Firefox gives the second clone EC, NS and AGC while `getSettings()` reports them off.

`raw-microphone.js` keeps every Meet mic track and clone unprocessed until the call starts, then restores what Meet asked for. The console says when: "Paused your mic's noise filters so Meet can hear the meeting room" on the join screen, and "You're in the call, so your mic's noise filters are back on" after you join. Only tested on macOS.

## Development

```bash
npx web-ext run     # Firefox with the extension loaded
npx web-ext lint
```
