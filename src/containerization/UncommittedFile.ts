import { inject, injectable } from 'inversify';
import type vscode from 'vscode';
import ChildProcessGateway from 'gateway/ChildProcessGateway';
import EditorGateway from 'gateway/EditorGateway';
import Spawn from 'common/Spawn';
import Types from 'common/Types';
import { SUPPRESS_UNCOMMITTED_FILE_WARNING } from 'constant';

@injectable()
export default class UncommittedFile {
  @inject(Types.IChildProcessGateway)
  childProcess!: ChildProcessGateway;

  @inject(Types.IEditorGateway)
  editorGateway!: EditorGateway;

  @inject(Spawn)
  spawn!: Spawn;

  /**
   * Shows a warning if there are uncommitted files in the repo.
   *
   * Those won't be part of the build.
   * Uncommitted changes to .circleci/config.yml will still be part of the build.
   */
  warn(
    context: vscode.ExtensionContext,
    repoPath: string,
    jobName: string,
    checkoutJobs: string[]
  ): void {
    if (context.globalState.get(SUPPRESS_UNCOMMITTED_FILE_WARNING)) {
      return;
    }

    // Gets tracked files that have an uncommitted diff.
    const { stdout } = this.childProcess.cp.spawn(
      'git',
      ['status', '-suno'],
      this.spawn.getOptions(repoPath)
    );

    stdout.on('data', (data: { toString: () => string }) => {
      const uncommittedFiles = data
        ?.toString()
        .split(`\n`)
        .filter(
          (line: string) =>
            !!line?.trim() &&
            !line.match(/\s\.circleci\/config\.yml/) && // The file should not start with .circleci/config.yml, as edits to that will appear in Local CI.
            !line.includes('.vscode/')
        )
        .join(', ');

      if (uncommittedFiles) {
        const textDontShowAgain = `Don't show again`;
        const checkoutJobMessage = checkoutJobs.some((job) => job === jobName)
          ? ``
          : `Then, please rerun a checkout job, like ${checkoutJobs.join(
              ', '
            )}.`;

        this.editorGateway.editor.window
          .showWarningMessage(
            `There are uncommitted changes that won't be part of this ${jobName} job: ${uncommittedFiles}.
          Please commit those changes if you'd like them to be part of the job. ${checkoutJobMessage}`,
            { detail: 'There are uncommitted changes' },
            textDontShowAgain
          )
          .then((clicked) => {
            if (clicked === textDontShowAgain) {
              context.globalState.update(
                SUPPRESS_UNCOMMITTED_FILE_WARNING,
                true
              );
            }
          });
      }
    });
  }
}
