import { renderToString } from 'react-dom/server';
import Index from './components/layout/index-page/Index';
import type { PageLocals } from './components/layout/index-page/Index';
import LoadingSplash from './components/layout/loading-splash/LoadingSplash';
import LoudnessPage from './components/layout/loudness-page/LoudnessPage';

export default function htmlGenerator(locals: PageLocals & { path: string }) {
  if (locals.path === '/loading.html') {
    return locals.doctype + renderToString(<LoadingSplash locals={locals} />);
  }

  if (locals.path === '/loudness.html') {
    return locals.doctype + renderToString(<LoudnessPage locals={locals} />);
  }

  return locals.doctype + renderToString(<Index locals={locals} />);
}
