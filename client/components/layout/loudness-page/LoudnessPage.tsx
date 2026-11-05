import type { PageLocals } from '../index-page/Index';

/** The page of the hidden window that measures the loudness: it has nothing to show, only the script that decodes the files it is asked for */
const LoudnessPage = ({ locals }: { locals: PageLocals }) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <title>Tunelle loudness</title>
    </head>
    <body>
      <script src={locals.assets.loudness} />
    </body>
  </html>
);

export default LoudnessPage;
