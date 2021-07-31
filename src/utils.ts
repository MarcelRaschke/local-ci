import { execSync } from 'child_process';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as vscode from 'vscode';

interface Step {
  checkout?: Record<string, unknown> | string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  attach_workspace?: {
    at?: string;
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  persist_to_workspace?: {
    root?: string;
    paths?: Array<string>;
  };
  run?: {
    command?: string;
  };
}

interface ConfigFile {
  jobs: Record<
    string,
    {
      docker: Array<Record<string, string>>;
      steps?: Array<Step>;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      working_directory?: string;
    }
  >;
}

export function getConfigFile(configFilePath = ''): ConfigFile {
  const configFile = yaml.load(fs.readFileSync(configFilePath, 'utf8'));
  if (!(configFile as ConfigFile)?.jobs) {
    throw new Error('No jobs found in config file');
  }

  return configFile as ConfigFile;
}

export function getJobs(configFilePath = ''): string[] | [] {
  return Object.keys(getConfigFile(configFilePath)?.jobs ?? {});
}

export function getCheckoutJobs(inputFile = ''): string[] {
  const configFile = getConfigFile(inputFile);

  return Object.keys(configFile?.jobs ?? []).filter((jobName) =>
    configFile.jobs[jobName]?.steps?.some(
      (step) => 'checkout' === step || step.checkout
    )
  );
}

export function getCheckoutDirectoryBasename(processFile: string): string {
  const checkoutJobs = getCheckoutJobs(processFile);
  const configFile = getConfigFile(processFile);

  if (!configFile || !checkoutJobs.length) {
    return '';
  }

  const baseNames = checkoutJobs.reduce(
    (accumulator: string[], checkoutJob: string) => {
      if (!configFile.jobs[checkoutJob]?.steps) {
        return accumulator;
      }

      const defaultWorkspace = getDefaultWorkspace(
        configFile.jobs[checkoutJob]?.docker[0]?.image
      );

      const stepWithPersist = configFile?.jobs[checkoutJob]?.steps?.find(
        (step) => step?.persist_to_workspace
      );

      const persistToWorkspacePath = stepWithPersist?.persist_to_workspace
        ?.paths?.length
        ? stepWithPersist.persist_to_workspace.paths[0]
        : '';

      const pathBase =
        !stepWithPersist?.persist_to_workspace?.root ||
        '.' === stepWithPersist.persist_to_workspace.root
          ? configFile.jobs[checkoutJob]?.working_directory ?? defaultWorkspace
          : stepWithPersist.persist_to_workspace.root;

      return !persistToWorkspacePath || persistToWorkspacePath === '.'
        ? [...accumulator, pathBase]
        : [...accumulator, persistToWorkspacePath];
    },
    []
  );

  return baseNames.length ? baseNames[0] : '';
}

export function changeCheckoutJob(processFile: string): void {
  const checkoutJobs = getCheckoutJobs(processFile);
  const configFile = getConfigFile(processFile);

  if (!configFile) {
    return;
  }

  if (!checkoutJobs.length) {
    fs.writeFileSync(processFile, yaml.dump(configFile));
    return;
  }

  checkoutJobs.forEach((checkoutJob: string) => {
    if (!configFile || !configFile.jobs[checkoutJob]?.steps) {
      return;
    }

    const defaultWorkspace = getDefaultWorkspace(
      configFile.jobs[checkoutJob]?.docker[0]?.image
    );

    configFile.jobs[checkoutJob].steps = configFile?.jobs[
      checkoutJob
    ]?.steps?.map((step) => {
      if (!step?.persist_to_workspace) {
        return step;
      }

      const persistToWorkspacePath = step?.persist_to_workspace?.paths?.length
        ? step.persist_to_workspace.paths[0]
        : '';

      const pathBase =
        !step?.persist_to_workspace?.root ||
        '.' === step.persist_to_workspace.root
          ? configFile.jobs[checkoutJob]?.working_directory ?? defaultWorkspace
          : step.persist_to_workspace.root;

      const fullPath =
        !persistToWorkspacePath || persistToWorkspacePath === '.'
          ? pathBase
          : `${pathBase}/${persistToWorkspacePath}`;

      return step.persist_to_workspace
        ? {
            run: {
              command: `cp -r ${fullPath} /tmp`,
            },
          }
        : step;
    });
  });

  fs.writeFileSync(processFile, yaml.dump(configFile));
}

export function getRootPath(): string {
  return vscode.workspace?.workspaceFolders?.length
    ? vscode.workspace.workspaceFolders[0]?.uri?.path
    : '';
}

export async function runJob(jobName: string): Promise<void> {
  const processFile = 'process.yml';

  const terminal = vscode.window.createTerminal({
    name: 'local-ci test',
    message: `Running the CircleCI job ${jobName}`,
  });

  const tmpPath = '/tmp/circleci';
  try {
    execSync(`mkdir -p ${tmpPath}`);
    execSync(
      `circleci config process ${getRootPath()}/.circleci/config.yml > ${tmpPath}/${processFile}`
    );
  } catch (e) {
    vscode.window.showErrorMessage(
      `There was an error processing the CircleCI config: ${e.message}`
    );
  }

  changeCheckoutJob(`${tmpPath}/${processFile}`);
  const checkoutJobs = getCheckoutJobs(`${tmpPath}/${processFile}`);
  const directoryMatches = getRootPath().match(/[^/]+$/);
  const directory = directoryMatches ? directoryMatches[0] : '';

  const configFile = getConfigFile(`${tmpPath}/${processFile}`);
  const attachWorkspaceSteps = configFile?.jobs[jobName]?.steps?.length
    ? (configFile?.jobs[jobName]?.steps as Array<Step>).filter((step) =>
        Boolean(step.attach_workspace)
      )
    : [];

  const dockerImage = configFile?.jobs[jobName]?.docker.length
    ? configFile?.jobs[jobName]?.docker[0]?.image
    : '';

  const defaultWorkspace = getDefaultWorkspace(dockerImage);

  const initialAttachWorkspace =
    attachWorkspaceSteps.length && attachWorkspaceSteps[0]?.attach_workspace?.at
      ? attachWorkspaceSteps[0].attach_workspace.at
      : '';
  const attachWorkspace =
    '.' === initialAttachWorkspace || !initialAttachWorkspace
      ? defaultWorkspace
      : initialAttachWorkspace;

  const localVolume = `${tmpPath}/${directory}`;
  const volume = checkoutJobs.includes(jobName)
    ? `${localVolume}:/tmp`
    : `${localVolume}/${getCheckoutDirectoryBasename(
        processFile
      )}:${attachWorkspace}`;
  const debuggingTerminalName = 'local-ci debugging';
  const finalTerminalName = 'local-ci final terminal';

  terminal.sendText(`mkdir -p ${localVolume}`);
  terminal.sendText(
    `circleci local execute --job ${jobName} --config ${tmpPath}/${processFile} --debug -v ${volume}`
  );
  terminal.show();

  const delay = (milliseconds: number) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
  await delay(5000);
  const debuggingTerminal = vscode.window.createTerminal({
    name: debuggingTerminalName,
    message: 'This is inside the running container',
  });
  const latestContainer = '$(docker ps -lq)';
  const committedContainerBase = 'local-ci-';

  // Ensure the latest container is not circleci/picard, which is the container that runs jobs.
  // If it is, keep waiting.
  // Then, start an interactive bash session within the container.
  debuggingTerminal.sendText(`
    until [[ -n $(docker ps -q) && $(docker inspect -f '{{ .Config.Image}}' $(docker ps -q) | grep ${dockerImage}) ]]
    do
      sleep 5
    done
    for container in $(docker ps -q)
      do
        if [[ $(docker inspect --format='{{.Config.Image}}' $container) == ${dockerImage} ]]; then
          docker exec -it $container /bin/sh || exit 1
          break
        fi
      done`);

  debuggingTerminal.show();

  const finalTerminal = vscode.window.createTerminal({
    name: finalTerminalName,
    message: 'Debug the final state of the container',
    hideFromUser: true,
  });

  function commitContainer(): void {
    finalTerminal.sendText(
      `docker commit ${latestContainer} ${committedContainerBase}${jobName}`
    );
  }

  // Commit the latest container so that this can open an interactive session when it finishes.
  // Contianers exit when they finish.
  // So this creates an alternative container for shell access.
  commitContainer();
  const interval = setInterval(commitContainer, 5000);

  vscode.window.onDidCloseTerminal((closedTerminal) => {
    clearTimeout(interval);
    if (
      closedTerminal.name === debuggingTerminalName &&
      closedTerminal?.exitStatus?.code
    ) {
      // @todo: handle if debuggingTerminal exits because terminal hasn't started the container.
      finalTerminal.sendText(
        `docker run -it ${committedContainerBase}${jobName}`
      );
      finalTerminal.show();
    }

    if (closedTerminal.name === finalTerminalName) {
      // Remove the container and image that were copies of the running CircleCI job container.
      const imageName = `${committedContainerBase}${jobName}`;
      execSync(`
        for container in $(docker ps -q)
        do
        if [[ $(docker inspect --format='{{.Config.Image}}' $container) == ${imageName} ]]; then
            docker rm -f $container
          fi
        done
        docker rmi -f ${imageName}`);
    }
  });
}

export function getDefaultWorkspace(imageName: string): string {
  try {
    const stdout = execSync(
      `docker run -d ${imageName} | xargs docker inspect --format='{{.Config.WorkingDir}}'`
    );

    return stdout.toString().trim() || '/home/circleci/project';
  } catch (e) {
    vscode.window.showErrorMessage(
      `There was an error getting the default workspace: ${e.message}`
    );

    return '';
  }
}
