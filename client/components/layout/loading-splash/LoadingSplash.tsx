import type { CSSProperties } from 'react';
import type { PageLocals } from '../index-page/Index';
import Wordmark from '../wordmark/Wordmark';
import loading from './assets/loading.svg';

const style: Record<'body' | 'container' | 'wrapper' | 'logo' | 'name' | 'text' | 'track' | 'bar' | 'actions' | 'button', CSSProperties> = {
  body: {
    backgroundColor: 'transparent',
    margin: '0',
  },
  container: {
    WebkitAppRegion: 'drag',
    WebkitUserSelect: 'none',
    boxSizing: 'border-box',
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'radial-gradient(circle at 50% 38%, rgba(255, 122, 60, 0.18), transparent 55%), linear-gradient(180deg, #262b36, #0e1016)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    fontFamily: 'system-ui, sans-serif',
    color: '#ffffff',
  },
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  logo: {
    width: '112px',
    height: '112px',
  },
  name: {
    display: 'block',
    marginTop: '8px',
    height: '40px',
    width: 'auto',
  },
  text: {
    marginTop: '10px',
    minHeight: '16px',
    fontSize: '12px',
    letterSpacing: '0.02em',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  track: {
    marginTop: '14px',
    width: '180px',
    height: '3px',
    borderRadius: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  bar: {
    width: '0%',
    height: '100%',
    background: 'linear-gradient(90deg, #ffb347, #ff5a36)',
    transition: 'width 0.2s ease',
  },
  actions: {
    WebkitAppRegion: 'no-drag',
    display: 'none',
    gap: '10px',
    marginTop: '14px',
  },
  button: {
    padding: '6px 14px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: '#ffffff',
    font: 'inherit',
    fontSize: '12px',
    cursor: 'pointer',
  },
};

function LoadingSplash(props: { locals: Pick<PageLocals, 'title'> }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{props.locals.title}</title>
      </head>
      <body style={style.body}>
        <div style={style.container}>
          <div style={style.wrapper}>
            <img src={loading} style={style.logo} />
            <Wordmark style={style.name} />
            <div id="status" style={style.text} />
            <div id="progress-track" style={style.track} hidden>
              <div id="progress-bar" style={style.bar} />
            </div>
            <div id="actions" style={style.actions}>
              <button style={style.button} />
              <button style={style.button} />
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

export default LoadingSplash;
