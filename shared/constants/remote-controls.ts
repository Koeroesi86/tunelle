/** What a listener may be allowed to do with the player of a host; the host grants each one per device */
export const CONTROLS = ['playPause', 'skip', 'seek', 'volume', 'queue'] as const;
export type Control = (typeof CONTROLS)[number];
