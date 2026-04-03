import type { ResolvedBootstrapEnv, ResolvedSecret } from "./types";
import { resolveRuntimeState, withRuntimeStateFile } from "./state";
import type { ResolvedRuntimeState } from "./state";

export interface SyncSecretsInput {
  bootstrap: ResolvedBootstrapEnv;
  runtime: ResolvedRuntimeState;
}

interface SecretsSyncClient {
  syncSecrets(input: SyncSecretsInput): Promise<ResolvedSecret[]>;
}

type SecretsSyncClientFactory = () => SecretsSyncClient;
type BitwardenSdkModule = typeof import("@bitwarden/sdk-napi");

class BitwardenSdkSecretsClient implements SecretsSyncClient {
  async syncSecrets(input: SyncSecretsInput): Promise<ResolvedSecret[]> {
    return withRuntimeStateFile(input.runtime, async (stateFilePath) => {
      const sdk = await loadBitwardenSdkModule();
      const client = new sdk.BitwardenClient({
        apiUrl: input.bootstrap.apiUrl,
        deviceType: sdk.DeviceType.SDK,
        identityUrl: input.bootstrap.identityUrl,
        userAgent: "bwsm",
      });

      await client
        .auth()
        .loginAccessToken(input.bootstrap.accessToken, stateFilePath);

      const response = await client.secrets().sync(input.bootstrap.organizationId);

      return (response.secrets ?? []).map((secret) => ({
        creationDate: new Date(secret.creationDate),
        id: secret.id,
        key: secret.key,
        note: secret.note,
        organizationId: secret.organizationId,
        projectId: secret.projectId ?? null,
        revisionDate: new Date(secret.revisionDate),
        value: secret.value,
      }));
    });
  }
}

let createSecretsSyncClient: SecretsSyncClientFactory = () =>
  new BitwardenSdkSecretsClient();
let loadBitwardenSdkModule: () => Promise<BitwardenSdkModule> = () =>
  import("@bitwarden/sdk-napi");

export function getStateFilePath(workspaceRoot: string, target: string): string {
  return resolveRuntimeState(workspaceRoot, target, undefined).stateFile;
}

export async function syncTargetSecrets(input: SyncSecretsInput): Promise<ResolvedSecret[]> {
  return createSecretsSyncClient().syncSecrets(input);
}

export function __setSecretsSyncClientFactoryForTests(factory: SecretsSyncClientFactory | null): void {
  createSecretsSyncClient = factory ?? (() => new BitwardenSdkSecretsClient());
}

export function __setSdkModuleLoaderForTests(
  loader: (() => Promise<BitwardenSdkModule>) | null,
): void {
  loadBitwardenSdkModule = loader ?? (() => import("@bitwarden/sdk-napi"));
}
