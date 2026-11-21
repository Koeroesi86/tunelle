import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import classNames from 'classnames';
import { sourceCapabilities } from '@shared/schemas/sources';
import type { LibraryKind, SourceKind } from '@shared/schemas/sources';
import type { SourcesState } from '../../../redux/sources/reducer';
import { useTranslation } from '../../../i18n';
import style from './SourceServers.scss';

interface SourceServersProps {
  /** The kind of server this page is for: each has its own page, as its own API */
  kind: SourceKind;
  state: SourcesState;
  load: () => void;
  save: (server: Record<string, unknown>) => void;
  remove: (id: string) => void;
  discover: () => void;
  signInPlex: () => void;
  cancelPlexSignIn: () => void;
  addPlexServer: (id: string) => void;
  readCertificate: (url: string) => void;
  clearCertificate: () => void;
  /** Opens the page of a section of the libraries of the servers of this kind */
  openSection: (section: LibraryKind) => void;
}

const words = {
  subsonic: { title: 'sources.title', hint: 'sources.addHint', example: 'Navidrome' },
  jellyfin: { title: 'sources.jellyfinTitle', hint: 'sources.jellyfinAddHint', example: 'Jellyfin' },
  plex: { title: 'sources.plexTitle', hint: 'sources.plexAddHint', example: 'Plex' },
} as const;

/** A Plex server is entered with its token: the login of the other kinds has no user name there, so the entry keeps a fixed one */
const plexUser = 'plex';

/** The wrong user or password, which the page words in its language */
const wrongLogin = 40;

const PlexAccount = ({
  state,
  signInPlex,
  cancelPlexSignIn,
  addPlexServer,
}: Pick<SourceServersProps, 'state' | 'signInPlex' | 'cancelPlexSignIn' | 'addPlexServer'>) => {
  const { t } = useTranslation();
  const { plexAccount, saving } = state;

  return (
    <div className={style.discovery}>
      {plexAccount?.status !== 'waiting' && (
        <button type="button" className={style.action} onClick={signInPlex}>
          {t('sources.plexSignIn')}
        </button>
      )}
      {plexAccount?.status === 'waiting' && (
        <>
          <div className={style.hint} role="status">
            {t('sources.plexWaiting')}
          </div>
          <button type="button" className={style.action} onClick={cancelPlexSignIn}>
            {t('sources.cancel')}
          </button>
        </>
      )}
      {plexAccount?.status === 'failed' && (
        <div className={style.error} role="alert">
          {t('sources.failed', { error: plexAccount.error ?? '' })}
        </div>
      )}
      {plexAccount?.status === 'servers' && plexAccount.servers?.length === 0 && <div className={style.hint}>{t('sources.plexNoServers')}</div>}
      {plexAccount?.servers?.map(({ id, name }) => (
        <div key={id} className={style.server}>
          <span className={style.name}>{name}</span>
          <button type="button" className={style.action} disabled={saving} aria-label={t('sources.plexAdd', { name })} onClick={() => addPlexServer(id)}>
            {t(saving ? 'sources.checking' : 'sources.useShort')}
          </button>
        </div>
      ))}
    </div>
  );
};

const AddServer = ({
  kind,
  state,
  save,
  discover,
  signInPlex,
  cancelPlexSignIn,
  addPlexServer,
  readCertificate,
  clearCertificate,
  onClose,
}: Pick<
  SourceServersProps,
  'kind' | 'state' | 'save' | 'discover' | 'signInPlex' | 'cancelPlexSignIn' | 'addPlexServer' | 'readCertificate' | 'clearCertificate'
> & {
  onClose?: () => void;
}) => {
  const { t } = useTranslation();
  const { saving, failure, certificate, discovery } = state;
  const offered = (discovery?.servers ?? []).filter(({ url }) => !state.servers.some((server) => server.url === url));
  const [form, setForm] = useState({ name: '', url: '', username: kind === 'plex' ? plexUser : '', password: '' });
  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value }),
  });
  const valid = Object.values(form).every((value) => value.trim() !== '');
  const insecure = form.url.trim().toLowerCase().startsWith('http:');

  const submit = (event: FormEvent, approved?: string) => {
    event.preventDefault();
    if (valid && !saving) save({ id: crypto.randomUUID(), kind, ...form, certificate: approved });
  };

  return (
    <div className={style.tile}>
      <div className={style.sectionTitle}>{t('sources.add')}</div>
      <div className={style.hint}>{t(words[kind].hint)}</div>
      {kind === 'jellyfin' && (
        <div className={style.discovery}>
          <button type="button" className={style.action} disabled={discovery?.searching} onClick={discover}>
            {t(discovery?.searching ? 'sources.searching' : 'sources.discover')}
          </button>
          {discovery?.error && (
            <div className={style.error} role="alert">
              {t('sources.failed', { error: discovery.error })}
            </div>
          )}
          {discovery && !discovery.searching && !discovery.error && offered.length === 0 && <div className={style.hint}>{t('sources.noneFound')}</div>}
          {offered.map(({ id, name, url }) => (
            <div key={id} className={style.server}>
              <span className={style.name}>{name}</span>
              <span className={style.meta}>{url}</span>
              <button type="button" className={style.action} aria-label={t('sources.use', { name })} onClick={() => setForm({ ...form, name, url })}>
                {t('sources.useShort')}
              </button>
            </div>
          ))}
        </div>
      )}
      {kind === 'plex' && <PlexAccount state={state} signInPlex={signInPlex} cancelPlexSignIn={cancelPlexSignIn} addPlexServer={addPlexServer} />}
      <form className={style.form} onSubmit={(event) => submit(event, certificate?.certificate)}>
        <label className={style.field}>
          <span>{t('sources.name')}</span>
          <input autoComplete="off" placeholder={words[kind].example} {...field('name')} />
        </label>
        <label className={style.field}>
          <span>{t('sources.url')}</span>
          <input autoComplete="off" spellCheck={false} placeholder="https://music.example.com" {...field('url')} />
        </label>
        {kind !== 'plex' && (
          <label className={style.field}>
            <span>{t('sources.username')}</span>
            <input autoComplete="off" {...field('username')} />
          </label>
        )}
        <label className={style.field}>
          <span>{t(kind === 'plex' ? 'sources.token' : 'sources.password')}</span>
          <input type="password" autoComplete="off" {...field('password')} />
        </label>
        <div className={classNames(style.buttons, style.submit)}>
          <button type="submit" className={classNames(style.action, style.primary)} disabled={!valid || saving}>
            {t(saving ? 'sources.checking' : 'sources.save')}
          </button>
          {onClose && (
            <button type="button" className={style.action} onClick={onClose}>
              {t('sources.cancel')}
            </button>
          )}
        </div>
      </form>
      {insecure && <div className={style.warning}>{t('sources.insecure')}</div>}
      {failure && !failure.id && (
        <div className={style.error} role="alert">
          {t('sources.failed', { error: failure.error })}
        </div>
      )}
      {failure?.id && (
        <div className={style.error} role="alert">
          {failure.code === wrongLogin ? t('sources.wrongLogin') : t('sources.failed', { error: failure.error })}
        </div>
      )}
      {failure && !certificate && form.url.trim().toLowerCase().startsWith('https:') && (
        <button type="button" className={style.action} onClick={() => readCertificate(form.url.trim())}>
          {t('sources.readCertificate')}
        </button>
      )}
      {certificate && (
        <div role="group" aria-label={t('sources.certificate')}>
          <div className={style.warning}>{t('sources.certificateWarning', { url: certificate.url })}</div>
          <div className={style.code}>{certificate.code}</div>
          <div className={style.buttons}>
            <button type="button" className={style.action} disabled={!valid || saving} onClick={(event) => submit(event, certificate.certificate)}>
              {t('sources.approve')}
            </button>
            <button type="button" className={style.action} onClick={clearCertificate}>
              {t('sources.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const SourceServers = ({
  kind,
  state,
  load,
  save,
  remove,
  discover,
  signInPlex,
  cancelPlexSignIn,
  addPlexServer,
  readCertificate,
  clearCertificate,
  openSection,
}: SourceServersProps) => {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const servers = state.servers.filter((server) => server.kind === kind);

  useEffect(() => {
    load();
  }, []);

  // a server that was kept closes the form
  useEffect(() => {
    setAdding(false);
  }, [servers.length]);

  return (
    <div className={style.sourceServers}>
      <div className={style.content}>
        <div className={style.tile}>
          <div className={style.header}>
            <div className={style.sectionTitle}>{t(words[kind].title)}</div>
            {servers.length > 0 && !adding && (
              <button type="button" className={style.action} onClick={() => setAdding(true)}>
                {t('sources.add')}
              </button>
            )}
          </div>
          {servers.length === 0 && <div className={style.hint}>{t('sources.none')}</div>}
          {servers.map((server) => (
            <div key={server.id} className={style.server}>
              <div className={style.serverName}>
                <span className={style.name}>{server.name}</span>
                <span className={style.meta}>{server.url}</span>
              </div>
              <div className={style.buttons}>
                <button type="button" className={style.action} aria-label={t('sources.remove', { name: server.name })} onClick={() => remove(server.id)}>
                  {t('sources.removeShort')}
                </button>
              </div>
              {!server.protected && <div className={style.warning}>{t('sources.unprotected')}</div>}
            </div>
          ))}
        </div>
        {servers.length > 0 && (
          <div className={style.tile}>
            <div className={style.header}>
              <div className={style.sectionTitle}>{t('sources.libraryOf', { name: words[kind].example })}</div>
            </div>
            <div className={style.buttons}>
              {(sourceCapabilities[kind].library?.sections ?? []).map((section) => (
                <button key={section} type="button" className={style.action} onClick={() => openSection(section)}>
                  {t(`sources.section.${section}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        {(adding || servers.length === 0) && (
          <AddServer
            kind={kind}
            state={state}
            save={save}
            discover={discover}
            signInPlex={signInPlex}
            cancelPlexSignIn={cancelPlexSignIn}
            addPlexServer={addPlexServer}
            readCertificate={readCertificate}
            clearCertificate={clearCertificate}
            onClose={servers.length > 0 ? () => setAdding(false) : undefined}
          />
        )}
      </div>
    </div>
  );
};

export default SourceServers;
