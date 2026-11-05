export interface PageLocals {
  title: string;
  doctype: string;
  assets: {
    client: string;
  };
}

function IndexPage(props: { locals: PageLocals }) {
  // console.log('props', props)
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#222222" />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <title>{props.locals.title}</title>
      </head>
      <body>
        <div id="root" />
        <script src={props.locals.assets.client} />
      </body>
    </html>
  );
}

export default IndexPage;
