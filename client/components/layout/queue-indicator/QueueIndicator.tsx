import type { MessageKey } from '@shared/locales/translate';
import type { BackgroundTask } from '@shared/schemas/background-tasks';
import { useTranslation } from '../../../i18n';
import style from './QueueIndicator.scss';

interface QueueIndicatorProps {
  tasks?: BackgroundTask[];
}

const labels: Record<BackgroundTask['kind'], MessageKey> = {
  scan: 'backgroundTasks.scan',
  watch: 'backgroundTasks.watch',
  loudness: 'backgroundTasks.loudness',
  'album-art': 'backgroundTasks.albumArt',
};

/** A pill in the title bar while the background queue has work; hovering or focusing it lists the tasks that run and wait */
function QueueIndicator({ tasks = [] }: QueueIndicatorProps) {
  const { t } = useTranslation();
  const label = (task: BackgroundTask) => t(labels[task.kind]);
  const states = (task: BackgroundTask) => [
    task.running && t('backgroundTasks.running'),
    task.waiting > 0 && t('backgroundTasks.waiting', { count: task.waiting }),
  ];

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
            {states(task).map(
              (text, index) =>
                text && (
                  <span key={text} className={index === 0 ? style.running : style.waiting}>
                    {text}
                  </span>
                )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default QueueIndicator;
