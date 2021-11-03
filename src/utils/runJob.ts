import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { getBinaryPath } from '../../node/binary.js';
import areTerminalsClosed from './areTerminalsClosed';
import cleanUpCommittedImages from './cleanUpCommittedImages';
import commitContainer from './commitContainer';
import convertHomeDirToAbsolute from './convertHomeDirToAbsolute';
import getConfigFilePath from './getConfigFilePath';
import getConfigFromPath from './getConfigFromPath';
import getCheckoutJobs from './getCheckoutJobs';
import getDebuggingTerminalName from './getDebuggingTerminalName';
import getFinalDebuggingTerminalName from './getFinalTerminalName';
import getHomeDirectory from './getHomeDirectory';
import getImageFromJob from './getImageFromJob';
import getLatestCommittedImage from './getLatestCommittedImage';
import getLocalVolumePath from './getLocalVolumePath';
import getProcessFilePath from './getProcessFilePath';
import getProjectDirectory from './getProjectDirectory';
import getTerminalName from './getTerminalName';
import showMainTerminalHelperMessages from './showMainTerminalHelperMessages';
import showFinalTerminalHelperMessages from './showFinalTerminalHelperMessages';
import {
  COMMITTED_IMAGE_NAMESPACE,
  GET_RUNNING_CONTAINER_FUNCTION,
  CONTAINER_STORAGE_DIRECTORY,
} from '../constants';

export default async function runJob(
  context: vscode.ExtensionContext,
  jobName: string
): Promise<RunningTerminal[]> {
  const configFilePath = await getConfigFilePath(context);
  const repoPath = path.dirname(path.dirname(configFilePath));
  const terminal = vscode.window.createTerminal({
    name: getTerminalName(jobName),
    message: `About to run the CircleCI® job ${jobName}…`,
    iconPath: vscode.Uri.joinPath(
      context.extensionUri,
      'resources',
      'logo.svg'
    ),
    cwd: repoPath,
  });
  terminal.show();

  const processFilePath = getProcessFilePath(configFilePath);
  const checkoutJobs = getCheckoutJobs(getConfigFromPath(processFilePath));
  const localVolume = getLocalVolumePath(configFilePath);

  // If this is the only checkout job, rm the entire local volume directory.
  // This job will checkout to that volume, and there could be an error
  // if it attempts to cp to it and the files exist.
  // @todo: fix ocasional permission denied error for deleting this file.
  if (checkoutJobs.includes(jobName) && 1 === checkoutJobs.length) {
    fs.rmSync(localVolume, { recursive: true, force: true });
  }

  const config = getConfigFromPath(processFilePath);
  const attachWorkspaceSteps = config?.jobs[jobName]?.steps?.length
    ? (config?.jobs[jobName]?.steps as Array<Step>).filter((step) =>
        Boolean(step.attach_workspace)
      )
    : [];

  const jobImage = getImageFromJob(config?.jobs[jobName]);
  const initialAttachWorkspace =
    attachWorkspaceSteps.length && attachWorkspaceSteps[0]?.attach_workspace?.at
      ? attachWorkspaceSteps[0].attach_workspace.at
      : '';

  const homeDir = await getHomeDirectory(jobImage, terminal);
  const projectDirectory = await getProjectDirectory(jobImage, terminal);
  const attachWorkspace =
    '.' === initialAttachWorkspace || !initialAttachWorkspace
      ? projectDirectory
      : initialAttachWorkspace;

  const volume = checkoutJobs.includes(jobName)
    ? `${localVolume}:${convertHomeDirToAbsolute(
        initialAttachWorkspace || CONTAINER_STORAGE_DIRECTORY,
        homeDir
      )}`
    : `${localVolume}:${convertHomeDirToAbsolute(attachWorkspace, homeDir)}`;

  if (!fs.existsSync(localVolume)) {
    fs.mkdirSync(localVolume, { recursive: true });
  }

  terminal.sendText(
    `${getBinaryPath()} local execute --job ${jobName} --config ${processFilePath} --debug -v ${volume}`
  );

  showMainTerminalHelperMessages();
  const committedImageRepo = `${COMMITTED_IMAGE_NAMESPACE}/${jobName}`;

  commitContainer(jobImage, committedImageRepo);

  const intervalIdCommitContainer = setInterval(() => {
    commitContainer(jobImage, committedImageRepo);
  }, 2000);

  const debuggingTerminal = vscode.window.createTerminal({
    name: getDebuggingTerminalName(jobName),
    message: 'This is inside the running container',
    iconPath: vscode.Uri.joinPath(
      context.extensionUri,
      'resources',
      'logo.svg'
    ),
    cwd: repoPath,
  });

  // Once the container is available, start an interactive bash session within the container.
  debuggingTerminal.sendText(`
    ${GET_RUNNING_CONTAINER_FUNCTION}
    echo "Waiting for bash access to the running container… \n"
    until [[ -n $(get_running_container ${jobImage}) ]]
    do
      sleep 1
    done
    echo "Inside the job's container:"
    docker exec -it --workdir ${homeDir} $(get_running_container ${jobImage}) /bin/sh || exit 1
  `);

  let finalTerminal: vscode.Terminal | undefined;
  vscode.window.onDidCloseTerminal(async (closedTerminal) => {
    if (
      closedTerminal.name !== debuggingTerminal.name ||
      !closedTerminal?.exitStatus?.code
    ) {
      return;
    }

    clearInterval(intervalIdCommitContainer);
    if (finalTerminal || areTerminalsClosed(terminal, debuggingTerminal)) {
      return;
    }

    const latestCommmittedImageId = await getLatestCommittedImage(
      committedImageRepo
    );

    setTimeout(() => {
      showFinalTerminalHelperMessages(latestCommmittedImageId);
      cleanUpCommittedImages(committedImageRepo, latestCommmittedImageId);
    }, 4000);

    if (latestCommmittedImageId) {
      finalTerminal = vscode.window.createTerminal({
        name: getFinalDebuggingTerminalName(jobName),
        message: 'Debug the final state of the container',
        iconPath: vscode.Uri.joinPath(
          context.extensionUri,
          'resources',
          'logo.svg'
        ),
        cwd: repoPath,
      });

      // @todo: handle if debuggingTerminal exits because terminal hasn't started the container.
      finalTerminal.sendText(
        `echo "Inside a similar container after the job's container exited: \n"
        docker run -it --rm -v ${volume} --workdir ${homeDir} ${latestCommmittedImageId}`
      );
      finalTerminal.show();
    }
  });

  vscode.window.onDidCloseTerminal(() => {
    if (areTerminalsClosed(terminal, debuggingTerminal, finalTerminal)) {
      clearInterval(intervalIdCommitContainer);
      cleanUpCommittedImages(committedImageRepo);
    }
  });

  return [
    await terminal.processId,
    await debuggingTerminal.processId,
    finalTerminal ? await finalTerminal?.processId : finalTerminal,
  ];
}
