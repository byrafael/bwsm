#!/usr/bin/env node

import { doctorTarget } from "./doctor";
import { logoutTargetState, runWithSecrets } from "./run";

type ParsedRunCommand = {
  childCommand: string[];
  command: "run";
  persistState?: boolean;
  stateDir?: string;
  target: string;
};

type ParsedDoctorCommand = {
  command: "doctor";
  persistState?: boolean;
  stateDir?: string;
  target: string;
};

type ParsedLogoutCommand = {
  command: "logout";
  stateDir?: string;
  target: string;
};

type ParsedCommand = ParsedRunCommand | ParsedDoctorCommand | ParsedLogoutCommand;

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseCliArgs(argv);

    if (parsed.command === "run") {
      return await runWithSecrets(parsed.target, parsed.childCommand, {
        persistState: parsed.persistState,
        stateDir: parsed.stateDir,
      });
    }

    if (parsed.command === "doctor") {
      const result = await doctorTarget(parsed.target, {
        persistState: parsed.persistState,
        stateDir: parsed.stateDir,
      });

      for (const line of result.lines) {
        console.log(line);
      }

      return result.ok ? 0 : 1;
    }

    const logoutResult = await logoutTargetState(parsed.target, {
      stateDir: parsed.stateDir,
    });

    if (logoutResult.removed) {
      console.log(`[ok] logout: removed state file ${logoutResult.stateFile}`);
    } else {
      console.log(
        `[ok] logout: no state file found at ${logoutResult.stateFile}`,
      );
    }

    if (logoutResult.pruned) {
      console.log(`[ok] logout: pruned empty state directory ${logoutResult.stateDir}`);
    }

    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function parseCliArgs(argv: string[]): ParsedCommand {
  const [command, ...rest] = argv;

  if (!command) {
    throw new Error(
      "Usage: bwsm <run|doctor|logout> --target <target> [options]",
    );
  }

  if (command === "run") {
    const separatorIndex = rest.indexOf("--");

    if (separatorIndex === -1) {
      throw new Error("Missing -- separator before child command");
    }

    const optionArgs = rest.slice(0, separatorIndex);
    const childCommand = rest.slice(separatorIndex + 1);

    if (childCommand.length === 0) {
      throw new Error("Missing child command to run");
    }

    const parsedOptions = parseSharedOptions(optionArgs, {
      allowPersistState: true,
      command,
    });

    return {
      ...parsedOptions,
      childCommand,
      command,
    };
  }

  if (command === "doctor") {
    return {
      ...parseSharedOptions(rest, {
        allowPersistState: true,
        command,
      }),
      command,
    };
  }

  if (command === "logout") {
    return {
      ...parseSharedOptions(rest, {
        allowPersistState: false,
        command,
      }),
      command,
    };
  }

  throw new Error(
    `Unsupported command ${command}. Expected one of: run, doctor, logout.`,
  );
}

function parseSharedOptions(
  args: string[],
  options: { allowPersistState: boolean; command: string },
): { persistState?: boolean; stateDir?: string; target: string } {
  let persistState: boolean | undefined;
  let stateDir: string | undefined;
  let target: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--target") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("Missing required --target <target> option");
      }

      target = value;
      index += 1;
      continue;
    }

    if (arg === "--state-dir") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("Missing required value for --state-dir <dir>");
      }

      stateDir = value;
      index += 1;
      continue;
    }

    if (arg === "--persist-state" || arg === "--no-persist-state") {
      if (!options.allowPersistState) {
        throw new Error(`Unsupported option ${arg} for ${options.command}`);
      }

      persistState = arg === "--persist-state";
      continue;
    }

    throw new Error(`Unknown option ${arg}`);
  }

  if (!target) {
    throw new Error("Missing required --target <target> option");
  }

  return { persistState, stateDir, target };
}

if (import.meta.main) {
  process.exitCode = await runCli();
}
