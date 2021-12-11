import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import convertToBash from './convertToBash';
import getAttachWorkspaceCommand from './getAttachWorkspaceCommand';
import getCheckoutJobs from './getCheckoutJobs';
import getConfig from './getConfig';
import getRestoreCacheCommand from './getRestoreCacheCommand';
import { CONTAINER_STORAGE_DIRECTORY } from '../constants';
import getSaveCacheSteps from './getSaveCacheSteps';

function getPersistToWorkspaceCommand(step: FullStep): string | undefined {
  if (typeof step?.persist_to_workspace?.paths === 'string') {
    const pathToPersist = path.join(
      step?.persist_to_workspace?.root ?? '.',
      step?.persist_to_workspace?.paths
    );

    // BusyBox doesn't have the -n option.
    return `cp -rn ${pathToPersist} ${CONTAINER_STORAGE_DIRECTORY} || cp -ru ${pathToPersist} ${CONTAINER_STORAGE_DIRECTORY}`;
  }

  return step?.persist_to_workspace?.paths.reduce(
    (accumulator, workspacePath) => {
      const pathToPersist = path.join(
        step?.persist_to_workspace?.root ?? '.',
        workspacePath
      );

      // BusyBox doesn't have the -n option.
      return `${accumulator} cp -rn ${pathToPersist} ${CONTAINER_STORAGE_DIRECTORY} || cp -ru ${pathToPersist} ${CONTAINER_STORAGE_DIRECTORY} \n`;
    },
    ''
  );
}

function getSaveCacheCommand(step: FullStep): string | undefined {
  return step?.save_cache?.paths.reduce((accumulator, directory) => {
    const destination = path.join(
      CONTAINER_STORAGE_DIRECTORY,
      convertToBash(step?.save_cache?.key ?? '')
    );

    return `${accumulator} mkdir -p ${destination}; cp -rn ${directory} ${destination} || cp -ru ${directory} ${destination} \n`;
  }, '');
}

// Overwrites parts of the process.yml file.
// When there's a persist_to_workspace value in a checkout job, this copies
// the files inside the container to the volume shared with the local machine.
// This way, they can persist between jobs.
// Likewise, on attach_workspace, it copies from the volume.
// The processedConfig was already compiled by the CircleCI® CLI binary.
export default function writeProcessFile(
  processedConfig: string,
  processFilePath: string
): void {
  const config = getConfig(processedConfig);
  const checkoutJobs = getCheckoutJobs(config);

  if (!config) {
    return;
  }

  if (!checkoutJobs.length) {
    fs.writeFile(processFilePath, yaml.dump(config), () => '');
    return;
  }

  const newConfig = {
    ...config,
    jobs: Object.keys(config.jobs).reduce(
      (accumulator: Jobs | Record<string, unknown>, jobName: string) => {
        if (!config || !config.jobs[jobName]?.steps) {
          return {
            ...accumulator,
            [jobName]: config?.jobs[jobName],
          };
        }

        // Simulate attach_workspace and persist_to_workspace.
        return {
          ...accumulator,
          [jobName]: {
            ...config.jobs[jobName],
            steps: config.jobs[jobName].steps?.map((step: Step) => {
              if (typeof step === 'string') {
                return step;
              }

              if (step?.attach_workspace) {
                return {
                  run: {
                    name: 'Attach workspace',
                    command: getAttachWorkspaceCommand(step),
                  },
                };
              }

              if (step?.persist_to_workspace) {
                return {
                  run: {
                    name: 'Persist to workspace',
                    command: getPersistToWorkspaceCommand(step),
                  },
                };
              }

              if (step?.restore_cache) {
                return {
                  run: {
                    name: 'Restore cache',
                    command: getRestoreCacheCommand(
                      step,
                      getSaveCacheSteps(config)
                    ),
                  },
                };
              }

              if (step?.save_cache) {
                return {
                  run: {
                    name: 'Save cache',
                    command: getSaveCacheCommand(step),
                  },
                };
              }

              return step;
            }),
          },
        };
      },
      {}
    ),
  };

  if (!fs.existsSync(path.dirname(processFilePath))) {
    fs.mkdirSync(path.dirname(processFilePath), { recursive: true });
  }
  fs.writeFileSync(processFilePath, yaml.dump(newConfig));
}
