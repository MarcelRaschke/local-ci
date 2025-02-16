import { inject, injectable } from 'inversify';
import type vscode from 'vscode';
import Types from 'common/Types';
import ChildProcessGateway from 'gateway/ChildProcessGateway';
import ConfigFile from 'config/ConfigFile';
import EditorGateway from 'gateway/EditorGateway';
import FsGateway from 'gateway/FsGateway';
import getDynamicConfigPath from 'config/getDynamicConfigPath';
import JobProvider from 'job/JobProvider';
import JobTreeItem from 'job/JobTreeItem';
import LogFile from 'log/LogFile';
import ParsedConfig from 'config/ParsedConfig';
import Spawn from 'common/Spawn';
import { SUPPRESS_JOB_COMPLETE_MESSAGE } from 'constant';
import { getPicardContainerFunction } from 'script';

@injectable()
export default class JobListener {
  @inject(Types.IChildProcessGateway)
  childProcessGateway!: ChildProcessGateway;

  @inject(ConfigFile)
  configFile!: ConfigFile;

  @inject(Types.IEditorGateway)
  editorGateway!: EditorGateway;

  @inject(FsGateway)
  fsGateway!: FsGateway;

  @inject(LogFile)
  logFile!: LogFile;

  @inject(ParsedConfig)
  parsedConfig!: ParsedConfig;

  @inject(Spawn)
  spawn!: Spawn;

  listen(
    context: vscode.ExtensionContext,
    jobProvider: JobProvider,
    job: JobTreeItem | undefined,
    commitProcess: ReturnType<ChildProcessGateway['cp']['spawn']>,
    doesJobCreateDynamicConfig: boolean,
    jobConfigPath: string,
    logFilePath: string
  ) {
    const jobName = job?.getJobName();
    this.fsGateway.fs.writeFileSync(
      logFilePath,
      `Log for CircleCI® job ${jobName} \n${new Date()} \n\n`
    );
    const complainToMeLink =
      'mailto:ryan@getlocalci.com?subject=There was an error using Local CI&body=Hi Ryan, Could you help with this error I saw with Local CI: <!-- please fill in error here -->';

    const process = this.childProcessGateway.cp.spawn(
      '/bin/sh',
      [
        '-c',
        `cat ${jobConfigPath} >> ${logFilePath}
        ${getPicardContainerFunction}
        until [ -n "$(get_picard_container ${jobName})" ]
        do
          sleep 2
        done
        docker logs --follow "$(get_picard_container ${jobName})"`,
      ],
      this.spawn.getOptions()
    );

    process.stdout.on('data', async (data) => {
      const output = data?.toString();
      if (!output?.length) {
        return;
      }

      this.fsGateway.fs.appendFileSync(
        logFilePath,
        // Remove terminal color encoding, like [32m
        // Convert this: [32mSuccess![0m
        // To: Success!
        output.replace(/\[[0-9]+m/g, '') // eslint-disable-line no-control-regex
      );

      // This should be the final 'Success!' message when a job succeeds.
      // There are a lot of other 'Success!' messages that might trigger this incorrectly.
      // @todo: look for a more reliable way to detect success.
      if (output?.includes(`[32mSuccess![0m`)) {
        job?.setIsSuccess();
        job?.setExpanded();
        jobProvider.refresh(job);

        this.handleExit(context, job, logFilePath, true);
        commitProcess.kill();

        if (doesJobCreateDynamicConfig) {
          jobProvider.hardRefresh();
          const dynamicConfig = this.parsedConfig.get(
            getDynamicConfigPath(await this.configFile.getPath(context))
          );

          this.editorGateway.editor.window.showInformationMessage(
            dynamicConfig?.jobs
              ? `Success! You can now run the dynamic config jobs.`
              : `The step succeeded, but it didn't create any dynamic job`
          );
        } else {
          jobProvider.refresh(job);
        }
      }

      if (output?.includes('Task failed')) {
        job?.setIsFailure();
        job?.setExpanded();
        jobProvider.refresh(job);

        this.handleExit(context, job, logFilePath, false);
        commitProcess.kill();
      }

      const dockerRelatedErrors = [
        'failed to create runner binary',
        'error while creating mount source path',
      ];

      dockerRelatedErrors.forEach((errorMessage) => {
        if (output?.includes(errorMessage)) {
          const complainToMeText = 'Complain to me';
          this.editorGateway.editor.window
            .showErrorMessage(
              `Restarting Docker Desktop should fix that error '${errorMessage}', though that's not fun`,
              { detail: 'Possible solution' },
              complainToMeText
            )
            .then((clicked) => {
              if (clicked === complainToMeText) {
                this.editorGateway.editor.env.openExternal(
                  this.editorGateway.editor.Uri.parse(complainToMeLink)
                );
              }
            });
        }
      });

      const errors = [
        {
          message: 'compinit: insecure directories',
          solutionUrl:
            'https://github.com/zsh-users/zsh-completions/issues/680#issuecomment-864906013',
        },
        {
          message: 'OCI runtime create failed',
          solutionUrl:
            'https://github.com/getlocalci/local-ci/discussions/121#discussion-4075651',
        },
        {
          message: '--storage-opt is supported only for overlay',
          solutionUrl:
            'https://github.com/getlocalci/local-ci/discussions/165#discussioncomment-3458645',
        },
      ];

      errors.forEach((error) => {
        if (output?.includes(error.message)) {
          const getBashCommandsText = 'Get Bash commands';
          const complainToMeText = 'Complain to me';
          this.editorGateway.editor.window
            .showErrorMessage(
              'You might be able to fix this failed job with Bash commands',
              { detail: 'Possible solution' },
              getBashCommandsText,
              complainToMeText
            )
            .then((clicked) => {
              if (clicked === getBashCommandsText) {
                this.editorGateway.editor.env.openExternal(
                  this.editorGateway.editor.Uri.parse(error.solutionUrl)
                );
              }

              if (clicked === complainToMeText) {
                this.editorGateway.editor.env.openExternal(
                  this.editorGateway.editor.Uri.parse(complainToMeLink)
                );
              }
            });
        }
      });
    });

    return process;
  }

  handleExit(
    context: vscode.ExtensionContext,
    job: JobTreeItem | undefined,
    logFilePath: string,
    didSucceed: boolean
  ): void {
    const folderUri = this.editorGateway.editor.workspace.workspaceFolders
      ?.length
      ? this.editorGateway.editor.workspace.workspaceFolders[0].uri
      : null;

    if (!folderUri || context.globalState.get(SUPPRESS_JOB_COMPLETE_MESSAGE)) {
      return;
    }

    const showJobOutput = 'Show job log';
    const complainToMeText = 'Complain to me';
    const complainToMeLink =
      'mailto:ryan@getlocalci.com?subject=A job failed with Local Ci, and I do not know why&body=Hi Ryan, Could you help with this error I saw with a Local CI job: <!-- please fill in error here -->';
    const dontShowAgain = `Don't show again`;

    this.editorGateway.editor.window
      .showInformationMessage(
        `The job ${job?.getJobName()} ${didSucceed ? 'succeeded' : 'failed'}`,
        ...(didSucceed
          ? [showJobOutput, dontShowAgain]
          : [showJobOutput, complainToMeText, dontShowAgain])
      )
      .then((clicked) => {
        if (clicked === showJobOutput) {
          this.logFile.show(logFilePath);
        }

        if (clicked === dontShowAgain) {
          context.globalState.update(SUPPRESS_JOB_COMPLETE_MESSAGE, true);
        }

        if (clicked === complainToMeText) {
          this.editorGateway.editor.env.openExternal(
            this.editorGateway.editor.Uri.parse(complainToMeLink)
          );
        }
      });
  }
}
