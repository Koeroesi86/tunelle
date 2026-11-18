import type { ControlCommand } from '../../shared/schemas/remote-control';
import type { Control } from './access';

/** The permission a command needs; the host allows each one per device */
export const permissionOf = (command: ControlCommand): Control => command.control;
