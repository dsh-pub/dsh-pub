import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import snapshotJson from './catalog.generated.json' with { type: 'json' };
import {
  defaultDirectoryQuery,
  directoryTopicIds,
  queryDirectory,
  topicCounts,
  type DirectoryEntry,
  type DirectoryQuery,
  type DirectoryTopic,
} from './catalog-query.js';
import type { DirectorySectionProps } from './dsh-contract.js';
import { directoryGitInstallSpec } from './git-install-spec.js';
import {
  installDirectoryEntry,
  type DirectoryInstallPhase,
  type DirectoryPluginManager,
} from './install-entry.js';
import type { DirectoryKey } from './locales.js';

interface DirectorySnapshot {
  schemaVersion: number;
  sources: {
    builtIn: { commit: string; generatedAt?: string };
    community: { generatedAt: string };
  };
  topics: Array<{
    id: DirectoryTopic;
    label: { en: string; zh: string };
  }>;
  entries: DirectoryEntry[];
}

const snapshot = snapshotJson as DirectorySnapshot;
const topicCodes: Record<DirectoryTopic, string> = {
  'ui-client': 'UI',
  'model-tools': 'M/',
  models: 'AI',
  storage: 'DB',
  workflow: 'WF',
  sessions: 'CX',
  runtime: 'RT',
  other: '++',
};

function selectValue(event: ChangeEvent<HTMLSelectElement>): string {
  return event.currentTarget.value;
}

interface InstallState {
  phase: 'installing' | DirectoryInstallPhase;
  reason?: string;
}

function installButtonKey(phase: InstallState['phase'] | undefined): DirectoryKey {
  if (phase === 'installing') return 'installing';
  if (phase === 'failed') return 'retryInstall';
  if (
    phase === 'installed' ||
    phase === 'already-installed' ||
    phase === 'restart-required' ||
    phase === 'overridden'
  ) {
    return 'installed';
  }
  return 'install';
}

export function DirectorySection({ t, installer }: DirectorySectionProps) {
  const [query, setQuery] = useState<DirectoryQuery>({ ...defaultDirectoryQuery });
  const [installs, setInstalls] = useState<Record<string, InstallState>>({});
  const mounted = useRef(true);
  const locale = t('locale') === 'zh' ? 'zh' : 'en';
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const counts = useMemo(() => topicCounts(snapshot.entries), []);
  const result = useMemo(() => queryDirectory(snapshot.entries, query), [query]);
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const update = <Key extends keyof DirectoryQuery>(key: Key, value: DirectoryQuery[Key]) => {
    setQuery((current) => ({ ...current, [key]: value, page: 1 }));
  };

  const installing = Object.values(installs).some((state) => state.phase === 'installing');

  const install = (entry: DirectoryEntry, manager: DirectoryPluginManager, spec: string) => {
    let started = false;
    setInstalls((current) => {
      if (Object.values(current).some((state) => state.phase === 'installing')) return current;
      started = true;
      return { ...current, [entry.slug]: { phase: 'installing' } };
    });
    if (!started) return;

    void installDirectoryEntry(manager, spec).then((result) => {
      if (!mounted.current) return;
      setInstalls((current) => ({
        ...current,
        [entry.slug]: result.reason
          ? { phase: result.status, reason: result.reason }
          : { phase: result.status },
      }));
    });
  };

  const hasFilters =
    query.search !== '' ||
    query.topic !== 'all' ||
    query.provenance !== 'all' ||
    query.surface !== 'all' ||
    query.distribution !== 'all' ||
    query.type !== 'all' ||
    query.sort !== 'name';

  return (
    <section className="dshpub-directory" aria-labelledby="dshpub-directory-title">
      <header className="dshpub-header">
        <div>
          <p className="dshpub-eyebrow">dsh.pub · {t('eyebrow')}</p>
          <h2 className="dshpub-title" id="dshpub-directory-title">
            {t('title')}
          </h2>
          <p className="dshpub-summary">{t('summary')}</p>
          <p className="dshpub-desktop-note">
            {t('desktopNote')}{' '}
            <a href="https://www.deepseek.com/harness/" target="_blank" rel="noreferrer">
              {t('desktopLink')}
            </a>
          </p>
        </div>
        <div className="dshpub-snapshot" aria-label={t('snapshot')}>
          <strong>{number.format(snapshot.entries.length)}</strong>
          <span>
            {t('entries')} · {t('pinned')}
            <br />
            {t('sourceRevision')} {snapshot.sources.builtIn.commit.slice(0, 7)}
          </span>
        </div>
      </header>

      <section className="dshpub-bus-section" aria-labelledby="dshpub-capability-bus">
        <div className="dshpub-section-heading">
          <div>
            <h3 id="dshpub-capability-bus">{t('capabilityBus')}</h3>
            <p>{t('capabilityHint')}</p>
          </div>
          <button
            className="dshpub-clear-topic"
            type="button"
            onClick={() => update('topic', 'all')}
            aria-pressed={query.topic === 'all'}
          >
            {t(query.topic === 'all' ? 'allTopics' : 'clearTopic')} · {number.format(counts.all)}
          </button>
        </div>
        <div className="dshpub-capability-bus">
          {directoryTopicIds.map((topicId) => {
            const topic = snapshot.topics.find((candidate) => candidate.id === topicId);
            if (!topic) return null;
            return (
              <button
                className="dshpub-topic"
                type="button"
                key={topicId}
                aria-pressed={query.topic === topicId}
                title={topic.label[locale]}
                onClick={() => update('topic', query.topic === topicId ? 'all' : topicId)}
              >
                <span className="dshpub-topic-code" aria-hidden="true">
                  {topicCodes[topicId]}
                </span>
                <span className="dshpub-topic-label">{topic.label[locale]}</span>
                <span className="dshpub-topic-count">{number.format(counts[topicId])}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="dshpub-controls">
        <div className="dshpub-field dshpub-search-field">
          <label htmlFor="dshpub-search">{t('searchLabel')}</label>
          <input
            id="dshpub-search"
            type="search"
            value={query.search}
            placeholder={t('searchPlaceholder')}
            onChange={(event) => update('search', event.currentTarget.value)}
          />
        </div>
        <div className="dshpub-field">
          <label htmlFor="dshpub-provenance">{t('provenance')}</label>
          <select
            id="dshpub-provenance"
            value={query.provenance}
            onChange={(event) =>
              update('provenance', selectValue(event) as DirectoryQuery['provenance'])
            }
          >
            <option value="all">{t('allSources')}</option>
            <option value="built-in">{t('builtIn')}</option>
            <option value="community">{t('community')}</option>
          </select>
        </div>
        <div className="dshpub-field">
          <label htmlFor="dshpub-surface">{t('surface')}</label>
          <select
            id="dshpub-surface"
            value={query.surface}
            onChange={(event) => update('surface', selectValue(event) as DirectoryQuery['surface'])}
          >
            <option value="all">{t('allSurfaces')}</option>
            <option value="host">{t('host')}</option>
            <option value="client">{t('client')}</option>
            <option value="hybrid">{t('hybrid')}</option>
            <option value="profile">{t('profile')}</option>
          </select>
        </div>
        <div className="dshpub-field">
          <label htmlFor="dshpub-distribution">{t('distribution')}</label>
          <select
            id="dshpub-distribution"
            value={query.distribution}
            onChange={(event) =>
              update('distribution', selectValue(event) as DirectoryQuery['distribution'])
            }
          >
            <option value="all">{t('allDistribution')}</option>
            <option value="installable">{t('installable')}</option>
            <option value="included">{t('included')}</option>
          </select>
        </div>
        <div className="dshpub-field">
          <label htmlFor="dshpub-type">{t('entryType')}</label>
          <select
            id="dshpub-type"
            value={query.type}
            onChange={(event) => update('type', selectValue(event) as DirectoryQuery['type'])}
          >
            <option value="all">{t('allTypes')}</option>
            <option value="plugin">{t('plugin')}</option>
            <option value="bundle">{t('bundle')}</option>
          </select>
        </div>
        <div className="dshpub-field">
          <label htmlFor="dshpub-sort">{t('sortBy')}</label>
          <select
            id="dshpub-sort"
            value={query.sort}
            onChange={(event) => update('sort', selectValue(event) as DirectoryQuery['sort'])}
          >
            <option value="name">{t('sortName')}</option>
            <option value="topic">{t('sortTopic')}</option>
            <option value="source">{t('sortSource')}</option>
            <option value="capabilities">{t('sortCapabilities')}</option>
          </select>
        </div>
      </div>

      <div className="dshpub-results-head" aria-live="polite">
        <strong>
          {number.format(result.total)} {t('results')}
        </strong>
        {hasFilters ? (
          <button
            className="dshpub-reset"
            type="button"
            onClick={() => setQuery({ ...defaultDirectoryQuery })}
          >
            {t('reset')}
          </button>
        ) : null}
      </div>

      {result.entries.length > 0 ? (
        <ol className="dshpub-list" start={(result.page - 1) * query.pageSize + 1}>
          {result.entries.map((entry) => {
            const detailUrl = `https://dsh.pub/${locale}/plugins/${entry.slug}/`;
            return (
              <li className="dshpub-entry" key={entry.slug}>
                <div className="dshpub-entry-main">
                  <div className="dshpub-entry-title-row">
                    <a
                      className="dshpub-entry-link"
                      href={detailUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${entry.name} · ${t('details')}`}
                    >
                      {entry.name} ↗
                    </a>
                    <span className="dshpub-badge dshpub-badge-strong">
                      {t(entry.provenance === 'built-in' ? 'builtIn' : 'community')}
                    </span>
                  </div>
                  <p className="dshpub-entry-description">{entry.description[locale]}</p>
                  <div className="dshpub-entry-meta">
                    <span className="dshpub-badge">{entry.category}</span>
                    <span className="dshpub-badge">{t(entry.type)}</span>
                    <span className="dshpub-result-meta">
                      {entry.capabilityCount} {t('capabilitySignals')}
                    </span>
                  </div>
                </div>
                <div className="dshpub-entry-side">
                  {entry.surfaces.map((surface) => (
                    <span className="dshpub-badge" key={surface}>
                      {t(surface)}
                    </span>
                  ))}
                  <DirectoryInstallControl
                    entry={entry}
                    installer={installer}
                    installing={installing}
                    state={installs[entry.slug]}
                    t={t}
                    onInstall={install}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="dshpub-empty">
          <h4>{t('emptyTitle')}</h4>
          <p>{t('emptyBody')}</p>
        </div>
      )}

      <footer className="dshpub-footer">
        <p className="dshpub-safe-note">{t('safetyNote')}</p>
        <nav className="dshpub-pagination" aria-label={`${t('page')} ${result.page}`}>
          <button
            type="button"
            disabled={result.page <= 1}
            onClick={() => setQuery((current) => ({ ...current, page: result.page - 1 }))}
          >
            {t('previous')}
          </button>
          <span className="dshpub-meta">
            {t('page')} {result.page} {t('of')} {result.pageCount}
          </span>
          <button
            type="button"
            disabled={result.page >= result.pageCount}
            onClick={() => setQuery((current) => ({ ...current, page: result.page + 1 }))}
          >
            {t('next')}
          </button>
        </nav>
      </footer>
    </section>
  );
}

function DirectoryInstallControl({
  entry,
  installer,
  installing,
  state,
  t,
  onInstall,
}: {
  entry: DirectoryEntry;
  installer: DirectoryPluginManager | undefined;
  installing: boolean;
  state: InstallState | undefined;
  t: DirectorySectionProps['t'];
  onInstall: (entry: DirectoryEntry, installer: DirectoryPluginManager, spec: string) => void;
}) {
  const spec = installer ? directoryGitInstallSpec(entry) : null;
  if (!installer || !spec) {
    return (
      <span className="dshpub-badge dshpub-badge-strong">
        {t(entry.installable ? 'installable' : 'included')}
      </span>
    );
  }

  const phase = state?.phase;
  const settled =
    phase === 'installed' ||
    phase === 'already-installed' ||
    phase === 'restart-required' ||
    phase === 'overridden';
  const status =
    phase === 'already-installed'
      ? t('alreadyInstalled')
      : phase === 'restart-required'
        ? t('restartRequired')
        : phase === 'overridden'
          ? t('overridden')
          : phase === 'failed'
            ? state?.reason || t('installFailed')
            : null;

  return (
    <>
      <button
        className="dshpub-install"
        type="button"
        disabled={installing || settled}
        aria-label={`${entry.name} · ${t(installButtonKey(phase))}`}
        onClick={() => onInstall(entry, installer, spec)}
      >
        {t(installButtonKey(phase))}
      </button>
      {status ? (
        <span className="dshpub-install-status" data-state={phase}>
          {status}
        </span>
      ) : null}
    </>
  );
}
