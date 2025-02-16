import { inject, injectable } from 'inversify';
import type vscode from 'vscode';
import type { Command } from './index';
import Types from 'common/Types';
import EditorGateway from 'gateway/EditorGateway';
import JobProvider from 'job/JobProvider';
import ReporterGateway from 'gateway/ReporterGateway';
import JobRunner from 'job/JobRunner';
import JobTerminals from 'terminal/JobTerminals';
import JobTreeItem from 'job/JobTreeItem';
import { DO_NOT_CONFIRM_RUN_JOB } from 'constant';

@injectable()
export default class ReRunJob implements Command {
  @inject(Types.IEditorGateway)
  editorGateway!: EditorGateway;

  @inject(JobRunner)
  jobRunner!: JobRunner;

  @inject(JobTerminals)
  jobTerminals!: JobTerminals;

  @inject(Types.IReporterGateway)
  reporterGateway!: ReporterGateway;

  commandName: string;

  constructor() {
    this.commandName = 'local-ci.job.rerun';
  }

  getCallback(context: vscode.ExtensionContext, jobProvider: JobProvider) {
    return (job: JobTreeItem) => {
      const confirmText = 'Yes';
      const dontAskAgainText = `Yes, don't ask again`;

      if (context.globalState.get(DO_NOT_CONFIRM_RUN_JOB)) {
        this.reRun(context, jobProvider, job);
        return;
      }

      this.editorGateway.editor.window
        .showInformationMessage(
          `Do you want to rerun the job ${job.getJobName()}?`,
          { modal: true },
          { title: confirmText },
          { title: dontAskAgainText }
        )
        .then((selection) => {
          if (
            selection?.title === confirmText ||
            selection?.title === dontAskAgainText
          ) {
            this.reRun(context, jobProvider, job);
          }

          if (selection?.title === dontAskAgainText) {
            context.globalState.update(DO_NOT_CONFIRM_RUN_JOB, true);
          }
        });
    };
  }

  async reRun(
    context: vscode.ExtensionContext,
    jobProvider: JobProvider,
    job: JobTreeItem
  ) {
    this.reporterGateway.reporter.sendTelemetryEvent('rerunJob');
    this.jobTerminals.dispose(job.getJobName());
    this.jobRunner.run(context, job.getJobName(), jobProvider, job);
  }
}
