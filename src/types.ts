export interface BitwardenBootstrapConfig {
  accessTokenEnv: string;
  organizationIdEnv: string;
  apiUrlEnv: string;
  identityUrlEnv: string;
}

export interface BitwardenRuntimeConfig {
  stateDir?: string;
  persistState?: boolean;
}

export interface BitwardenTargetConfig {
  projectIds: string[];
  includeKeys: string[];
  excludeKeys: string[];
}

export interface BitwardenConfig {
  bootstrap: BitwardenBootstrapConfig;
  runtime?: BitwardenRuntimeConfig;
  targets: Record<string, BitwardenTargetConfig>;
}

export interface ResolvedSecret {
  creationDate: Date;
  id: string;
  key: string;
  note: string;
  organizationId: string;
  projectId: string | null;
  revisionDate: Date;
  value: string;
}

export interface LoadedSecretsResult {
  env: Record<string, string>;
  hash: string;
  keys: string[];
  secrets: ResolvedSecret[];
  target: string;
  targetConfig: BitwardenTargetConfig;
  workspaceRoot: string;
}

export interface LoadSecretsForTargetOptions {
  workspaceRoot?: string;
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
  persistState?: boolean;
}

export interface InjectSecretsForTargetOptions
  extends LoadSecretsForTargetOptions {
  baseEnv?: NodeJS.ProcessEnv;
}

export interface RunWithSecretsOptions extends InjectSecretsForTargetOptions {
  cwd?: string;
}

export interface LogoutTargetStateOptions {
  workspaceRoot?: string;
  stateDir?: string;
}

export interface DoctorTargetOptions extends LoadSecretsForTargetOptions {}

export interface ResolvedBootstrapEnv {
  accessToken: string;
  apiUrl: string;
  config: BitwardenBootstrapConfig;
  identityUrl: string;
  organizationId: string;
  workspaceRoot: string;
}
