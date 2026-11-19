export {};

declare module '@homebridge/dbus-native' {
  /** The description of an exported interface: member name to [in signature, out signature, in names, out names] */
  export interface InterfaceDescription {
    name: string;
    methods: Record<string, [string, string, string[], string[]]>;
    /** Property name to signature */
    properties: Record<string, string>;
    /** Signal name to [signature, ...argument names] */
    signals?: Record<string, string[]>;
  }

  export interface BusConnection {
    end: () => void;
  }

  export interface MessageBus {
    exportInterface: (implementation: object, path: string, description: InterfaceDescription) => void;
    requestName: (name: string, flags: number, callback: (error: { name: string; message: string } | null, reply?: number) => void) => void;
    sendSignal: (path: string, iface: string, name: string, signature: string, args: unknown[]) => void;
  }

  export function sessionBus(): MessageBus;
}
