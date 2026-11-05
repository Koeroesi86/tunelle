import type { ReactNode } from 'react';
import classNames from 'classnames';
import style from './ViewSwitcher.scss';

export interface ViewItem<V extends string> {
  view: V;
  label: string;
  panel: ReactNode;
}

interface ViewSwitcherProps<V extends string> {
  views: ViewItem<V>[];
  current: V;
  setView: (view: V) => void;
  controls?: ReactNode;
  /** False when the sidebar picks the view and names it: the header then holds the controls only, and none at all without controls */
  tabs?: boolean;
}

const ViewSwitcher = <V extends string>({ views, current, setView, controls, tabs = true }: ViewSwitcherProps<V>) => (
  <div className={style.viewSwitcher}>
    {(tabs || controls) && (
      <div className={style.viewControls}>
        {tabs &&
          views.map(({ view, label }) => (
            <div key={view} className={classNames(style.view, { [style.current]: view === current })} onClick={() => setView(view)}>
              {label}
            </div>
          ))}
        {controls}
      </div>
    )}
    <div className={classNames(style.viewPanels, { [style.headless]: !tabs && !controls })}>
      {views.map(({ view, panel }) => (
        <div key={view} className={classNames(style.viewPanel, { [style.active]: view === current })}>
          {panel}
        </div>
      ))}
    </div>
  </div>
);

export default ViewSwitcher;
