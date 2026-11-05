import { Audio } from '../../audio/context';
import AudioSpectrum from './AudioSpectrum';
import type { AudioSpectrumProps } from './AudioSpectrum';

type ContextualProps = Partial<Omit<AudioSpectrumProps, 'createAnalyser' | 'addPlayStatusListener'>>;

const ContextualAudioSpectrum = (props: ContextualProps) => (
  <Audio.Consumer>
    {({ createAnalyser, addPlayStatusListener }) => <AudioSpectrum {...props} createAnalyser={createAnalyser} addPlayStatusListener={addPlayStatusListener} />}
  </Audio.Consumer>
);

export default ContextualAudioSpectrum;
