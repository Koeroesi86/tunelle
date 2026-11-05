declare module 'playlist-parser' {
  export interface PlaylistEntry {
    file: string;
    title?: string;
    length?: number;
  }

  export const PLS: {
    parse: (body: string) => PlaylistEntry[];
  };
}

declare module 'windows-shortcuts-appid' {
  type Callback = (error?: Error) => void;

  export function create(shortcutPath: string, options: { target: string; desc?: string; workingDir?: string; icon?: string }, callback: Callback): void;
  export function addAppId(shortcutPath: string, appId: string, callback: Callback): void;
}

declare module '*.scss' {
  const classNames: Record<string, string>;
  export default classNames;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
