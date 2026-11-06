import { measureTrack } from './measure-track';

// the entry of the page of the measuring window (client/components/layout/loudness-page): a request is answered when its track is measured
window.loudnessAPI.onMeasure(({ id, path, duration }) => {
  measureTrack(id, path, duration)
    .then(window.loudnessAPI.report)
    .catch(() => window.loudnessAPI.report({ id, outcome: 'undecodable' }));
});

window.loudnessAPI.ready();
