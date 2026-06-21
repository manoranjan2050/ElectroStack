export type ServiceStatus = "Running" | "Stopped" | "Missing" | "Unknown";

export type ServiceInfo = {
  key: string;
  name: string;
  status: ServiceStatus;
  port?: number;
  version?: string;
  executable: string;
};

export type Website = {
  domain: string;
  root: string;
  phpVersion: string;
  ssl: boolean;
  createdAt: string;
};

export type DatabaseInfo = {
  name: string;
  sizeMb: number;
  createdAt?: string;
};

export type BackupKind = "website" | "database" | "full";

export function isLocalDomain(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,62}\.local$/.test(value);
}

export function assertSafeArgs(args: string[]): string[] {
  const unsafe = args.find((arg) => /[;&|<>]/.test(arg));
  if (unsafe) {
    throw new Error(`Unsafe shell argument: ${unsafe}`);
  }
  return args;
}
