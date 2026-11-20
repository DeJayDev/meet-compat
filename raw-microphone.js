const processingConstraintNames = ['echoCancellation', 'noiseSuppression', 'autoGainControl'];
const rawProcessing = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
const requestedProcessingByTrack = new Map();

const pageGetUserMedia = MediaDevices.prototype.getUserMedia;
MediaDevices.prototype.getUserMedia = async function (constraints) {
  if (!constraints?.audio) return pageGetUserMedia.call(this, constraints);
  const requestedAudio = constraints.audio === true ? {} : constraints.audio;
  const stream = await pageGetUserMedia.call(this, { ...constraints, audio: { ...requestedAudio, ...rawProcessing } });
  const requestedProcessing = Object.fromEntries(processingConstraintNames.map((name) => [name, requestedAudio[name] ?? true]));
  if (requestedProcessingByTrack.size === 0) console.log("[meet-compat]: Paused your mic's noise filters so Meet can hear the meeting room.");
  requestedProcessingByTrack.set(stream.getAudioTracks()[0], requestedProcessing);
  return stream;
};

const pageApplyConstraints = MediaStreamTrack.prototype.applyConstraints;
MediaStreamTrack.prototype.applyConstraints = function (constraints = {}) {
  if (!requestedProcessingByTrack.has(this)) return pageApplyConstraints.call(this, constraints);
  const requestedProcessing = requestedProcessingByTrack.get(this);
  for (const name of processingConstraintNames) if (name in constraints) requestedProcessing[name] = constraints[name];
  return pageApplyConstraints.call(this, { ...constraints, ...rawProcessing });
};

function keepCloneUnprocessed(original, clone) {
  if (!requestedProcessingByTrack.has(original)) return;
  requestedProcessingByTrack.set(clone, { ...requestedProcessingByTrack.get(original) });
  pageApplyConstraints.call(clone, { ...clone.getConstraints(), ...rawProcessing });
}

const pageTrackClone = MediaStreamTrack.prototype.clone;
MediaStreamTrack.prototype.clone = function () {
  const clone = pageTrackClone.call(this);
  keepCloneUnprocessed(this, clone);
  return clone;
};

const pageStreamClone = MediaStream.prototype.clone;
MediaStream.prototype.clone = function () {
  const originals = this.getAudioTracks();
  const clone = pageStreamClone.call(this);
  clone.getAudioTracks().forEach((track, index) => keepCloneUnprocessed(originals[index], track));
  return clone;
};

async function restoreRequestedProcessing() {
  const pending = [...requestedProcessingByTrack].filter(([track]) => track.readyState === 'live');
  requestedProcessingByTrack.clear();
  await Promise.all(pending.map(([track, requestedProcessing]) => pageApplyConstraints.call(track, { ...track.getConstraints(), ...requestedProcessing })));
  console.log("[meet-compat]: You're in the call, so your mic's noise filters are back on.");
}

function restoreIfAudioTrack(track) {
  if (track instanceof MediaStreamTrack && track.kind === 'audio' && requestedProcessingByTrack.size > 0) restoreRequestedProcessing();
}

const pageAddTrack = RTCPeerConnection.prototype.addTrack;
RTCPeerConnection.prototype.addTrack = function (track, ...streams) {
  restoreIfAudioTrack(track);
  return pageAddTrack.call(this, track, ...streams);
};

const pageAddTransceiver = RTCPeerConnection.prototype.addTransceiver;
RTCPeerConnection.prototype.addTransceiver = function (trackOrKind, init) {
  restoreIfAudioTrack(trackOrKind);
  return pageAddTransceiver.call(this, trackOrKind, init);
};

const pageReplaceTrack = RTCRtpSender.prototype.replaceTrack;
RTCRtpSender.prototype.replaceTrack = function (track) {
  restoreIfAudioTrack(track);
  return pageReplaceTrack.call(this, track);
};
