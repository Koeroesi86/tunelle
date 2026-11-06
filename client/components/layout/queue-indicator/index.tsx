import QueueIndicator, { type QueueTask } from './QueueIndicator';

/** Mocked until the main process exposes the queue (issue #299) */
const mockTasks: QueueTask[] = [
  { kind: 'scan', target: 'Music', running: true, waiting: 0 },
  { kind: 'watch', target: 'Podcasts', running: false, waiting: 1 },
  { kind: 'loudness', running: false, waiting: 120 },
  { kind: 'albumArt', running: false, waiting: 8 },
];

const MockedQueueIndicator = () => <QueueIndicator tasks={mockTasks} />;

export default MockedQueueIndicator;
