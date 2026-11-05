/** The address of the page and of everything the main process serves: the library, the covers and the audio. A development run loads the page from the dev server, so the origin is spelled out. */
export const localUrl = (route: string) => `tunelle://app${route}`;
