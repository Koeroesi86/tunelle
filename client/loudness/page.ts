import { measureTrack } from './measure-track';

// the entry of the page of the measuring window (client/components/layout/loudness-page): a request is answered when its track is measured
/** The main process is told at most once a second, which is often enough for a time of minutes */
const progressPause = 1000;

window.loudnessAPI.onMeasure(({ id, path, duration }) => {
  let toldAt = 0;
  const progress = () => {
    if (Date.now() - toldAt < progressPause) return;
    toldAt = Date.now();
    window.loudnessAPI.progress(id);
  };
  measureTrack(id, path, duration, progress)
    .then(window.loudnessAPI.report)
    .catch(() => window.loudnessAPI.report({ id, outcome: 'undecodable' }));
});

window.loudnessAPI.ready();
