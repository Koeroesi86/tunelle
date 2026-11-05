import { renderToString } from 'react-dom/server';
import Index from './components/layout/index-page/Index';
import type { PageLocals } from './components/layout/index-page/Index';
import LoadingSplash from './components/layout/loading-splash/LoadingSplash';

export default function htmlGenerator(locals: PageLocals & { path: string }) {
  if (locals.path === '/loading.html') {
    return locals.doctype + renderToString(<LoadingSplash locals={locals} />);
  }

  return locals.doctype + renderToString(<Index locals={locals} />);
}
