declare global {
  interface Window {
    /** The audio element that plays now: the player may hold a second one for the track that follows */
    activeAudio?: () => HTMLAudioElement | undefined;
  }
}

/** Added to the page before its own code runs (page.addInitScript) */
export const installActiveAudio = () => {
  window.activeAudio = () => {
    const elements = Array.from(document.querySelectorAll('audio'));
    return elements.find((element) => !element.paused) ?? elements[0];
  };
};
