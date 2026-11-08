import { execFile } from 'child_process';
import { promisify } from 'util';
import { isFlagSet } from '../schemas/environment';

const execFileAsync = promisify(execFile);
const detectionTimeout = 3000;

// NetworkCostType of WinRT: Unrestricted, Fixed (a data cap), Variable (pay per use); Unknown and Default are not metered
const windowsScript =
  '[void][Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime];' +
  '[Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile().GetConnectionCost().NetworkCostType';

const read = (file: string, args: string[]) => execFileAsync(file, args, { timeout: detectionTimeout, windowsHide: true }).then(({ stdout }) => stdout.trim());

const isMeteredOnWindows = () =>
  read('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsScript]).then((cost) => ['Fixed', 'Variable'].includes(cost));

// NMMetered of NetworkManager: 1 yes, 3 guess yes; 0 unknown, 2 no, 4 guess no; busctl prints `u 1`
const isMeteredOnLinux = () =>
  read('busctl', ['get-property', 'org.freedesktop.NetworkManager', '/org/freedesktop/NetworkManager', 'org.freedesktop.NetworkManager', 'Metered']).then(
    (output) => ['u 1', 'u 3'].includes(output)
  );

/**
 * Whether the system says the connection is metered; any error, a timeout or an unknown answer counts as not metered, and so does macOS.
 * See docs/app/updater.md
 */
export const isMeteredConnection = async (): Promise<boolean> => {
  if (isFlagSet(process.env.TUNELLE_METERED)) return true;
  if (process.platform === 'win32') return isMeteredOnWindows().catch(() => false);
  if (process.platform === 'linux') return isMeteredOnLinux().catch(() => false);

  return false;
};
