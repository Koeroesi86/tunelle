import type { MessageKey } from '@shared/locales/translate';
import { useTranslation } from '../../../i18n';
import style from './QueueIndicator.scss';

export type QueueTaskKind = 'scan' | 'watch' | 'loudness' | 'albumArt';

export interface QueueTask {
  kind: QueueTaskKind;
  running: boolean;
  waiting: number;
}

interface QueueIndicatorProps {
  tasks?: QueueTask[];
}

const labels: Record<QueueTaskKind, MessageKey> = {
  scan: 'backgroundTasks.scan',
  watch: 'backgroundTasks.watch',
  loudness: 'backgroundTasks.loudness',
  albumArt: 'backgroundTasks.albumArt',
};

/** A pill in the title bar while the background queue has work; hovering or focusing it lists the tasks that run and wait */
function QueueIndicator({ tasks = [] }: QueueIndicatorProps) {
  const { t } = useTranslation();
  const label = (task: QueueTask) => t(labels[task.kind]);
  const state = (task: QueueTask) => (task.running ? t('backgroundTasks.running') : t('backgroundTasks.waiting', { count: task.waiting }));

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className={style.queueIndicator}>
      <span className={style.pill} tabIndex={0} aria-describedby="background-tasks">
        <span className={style.spinner} aria-hidden="true" />
        {tasks.length === 1 ? label(tasks[0]) : t('backgroundTasks.summary', { count: tasks.length })}
      </span>
      <div className={style.tooltip} role="tooltip" id="background-tasks">
        <div className={style.heading}>{t('backgroundTasks.title')}</div>
        {tasks.map((task) => (
          <div key={task.kind} className={style.row}>
            <span className={task.running ? style.spinner : style.idle} aria-hidden="true" />
            <span className={style.name}>{label(task)}</span>
            <span className={task.running ? style.running : style.waiting}>{state(task)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default QueueIndicator;
