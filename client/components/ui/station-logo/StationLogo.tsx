import { useState } from 'react';
import type { ReactNode } from 'react';
import { radioLogoRouteOf } from '../../../utils/cover-url';
import { useResolveUrl } from '../../../hooks/use-resolve-url';

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
  const resolveUrl = useResolveUrl();

  return hasLogo && !failed ? (
    <img className={className} src={resolveUrl(radioLogoRouteOf(uuid))} alt="" loading="lazy" onError={() => setFailed(true)} />
  ) : (
    fallback
  );
};

export default StationLogo;
