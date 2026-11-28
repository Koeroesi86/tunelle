import type { ElectronApplication, Page } from '@playwright/test';
import { readdirSync } from 'fs';
import { basename, dirname } from 'path';
import type { Sample } from '../../scripts/tooling/soak-judge';
import { memory } from '../perf/measure';

/** The files of the cache of the whole decodes, wherever below `folder` the system puts it (docs/app/decoder-cache.md) */
export const decodedFiles = (folder: string) =>
  readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter((path) => basename(dirname(path)) === 'whole-decodes');

/** The programs the main process has running: its decoders, as the app starts nothing else while it plays */
export const childProcesses = (app: ElectronApplication) =>
  app.evaluate(() => process.getActiveResourcesInfo().filter((kind) => kind === 'ProcessWrap').length);

const mainProcess = (app: ElectronApplication) =>
  app.evaluate(({ app: electron }) => {
    // the main process is not started with --expose-gc: without a collection its memory says more about the last one than about what is kept
    process.getBuiltinModule('v8').setFlagsFromString('--expose-gc');
    process.getBuiltinModule('vm').runInNewContext('gc')();
    return {
      processes: electron.getAppMetrics().length,
      mainResources: process.getActiveResourcesInfo().length,
      mainArrayBuffersMb: Math.round(process.memoryUsage().arrayBuffers / 1e5) / 10,
      // only Linux lists the open files of a process as a folder
      ...(process.platform === 'linux' ? { openFiles: process.getBuiltinModule('fs').readdirSync('/proc/self/fd').length } : {}),
    };
  });

const domCounts = async (page: Page) => {
  const session = await page.context().newCDPSession(page);
  return session.send('Memory.getDOMCounters').finally(() => session.detach());
};

/** What the app holds at this moment: its processes, handles, memory, the nodes and listeners of the page, its audio contexts and the decoded files */
export const takeSample = async (app: ElectronApplication, page: Page, cache: string): Promise<Sample> => {
  // the memory first: it collects the garbage of the page, which the counts of the nodes would else include
  const { totalMb, byProcessMb, rendererHeapMb, mainHeapMb } = await memory(app, page);
  const { nodes, jsEventListeners } = await domCounts(page);
  return {
    ...(await mainProcess(app)),
    totalMb,
    ...Object.fromEntries(Object.entries(byProcessMb).map(([kind, used]) => [`${kind.toLowerCase()}Mb`, used])),
    rendererHeapMb,
    mainHeapMb,
    domNodes: nodes,
    listeners: jsEventListeners,
    audioContexts: await page.evaluate(() => window.openAudioContexts?.() ?? 0),
    cacheFiles: decodedFiles(cache).length,
  };
};
