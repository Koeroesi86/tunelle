let playing = false;

/** The player tells the main process whether it plays, as the measurement of loudness waits for the disk while a track does */
export const setPlaying = (value: boolean) => {
  playing = value;
};

export const isPlaying = () => playing;
