import { useState } from 'react';
import type { ReactNode } from 'react';
import { getRadioLogoUrl } from '../../utils/cover-url';

interface StationLogoProps {
  uuid: string;
  /** Whether the directory has a logo for the station */
  hasLogo?: boolean;
  className?: string;
  /** What shows when there is no logo or it does not load */
  fallback?: ReactNode;
}

/** The logo of a station; one that does not load leaves the fallback, or nothing */
const StationLogo = ({ uuid, hasLogo = false, className, fallback = null }: StationLogoProps) => {
  const [failed, setFailed] = useState(false);

  return hasLogo && !failed ? <img className={className} src={getRadioLogoUrl(uuid)} alt="" loading="lazy" onError={() => setFailed(true)} /> : fallback;
};

export default StationLogo;
