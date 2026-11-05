import { renderToString } from 'react-dom/server';
import Index from './components/index-page/Index';
import type { PageLocals } from './components/index-page/Index';
import LoadingSplash from './components/loading-splash/LoadingSplash';

export default function htmlGenerator(locals: PageLocals & { path: string }) {
  if (locals.path === '/loading.html') {
    return locals.doctype + renderToString(<LoadingSplash locals={locals} />);
  }

  return locals.doctype + renderToString(<Index locals={locals} />);
}
