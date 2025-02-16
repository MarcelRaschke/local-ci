import { inject, injectable } from 'inversify';
import type vscode from 'vscode';
import Types from 'common/Types';
import AllConfigFiles from 'config/AllConfigFiles';
import AllJobs from './AllJobs';
import CommandFactory from './ComandFactory';
import Config from 'config/Config';
import ConfigFile from 'config/ConfigFile';
import Docker from 'containerization/Docker';
import EditorGateway from 'gateway/EditorGateway';
import FsGateway from 'gateway/FsGateway';
import JobFactory from './JobFactory';
import JobProvider from './JobProvider';
import License from 'license/License';
import LogFactory from 'log/LogFactory';
import ReporterGateway from 'gateway/ReporterGateway';
import WarningFactory from './WarningFactory';

@injectable()
export default class JobProviderFactory {
  @inject(AllConfigFiles)
  allConfigFiles!: AllConfigFiles;

  @inject(ConfigFile)
  configFile!: ConfigFile;

  @inject(CommandFactory)
  commandFactory!: CommandFactory;

  @inject(Docker)
  docker!: Docker;

  @inject(Types.IEditorGateway)
  editorGateway!: EditorGateway;

  @inject(Types.IFsGateway)
  fsGateway!: FsGateway;

  @inject(License)
  license!: License;

  @inject(Config)
  config!: Config;

  @inject(JobFactory)
  jobFactory!: JobFactory;

  @inject(LogFactory)
  logFactory!: LogFactory;

  @inject(Types.IReporterGateway)
  reporterGateway!: ReporterGateway;

  @inject(WarningFactory)
  warningFactory!: WarningFactory;

  @inject(AllJobs)
  allJobs!: AllJobs;

  create(
    context: vscode.ExtensionContext,
    jobDependencies?: Map<string, string[] | null>
  ) {
    return new JobProvider(
      context,
      this.reporterGateway,
      this.allConfigFiles,
      this.configFile,
      this.commandFactory,
      this.docker,
      this.editorGateway,
      this.fsGateway,
      this.license,
      this.config,
      this.jobFactory,
      this.logFactory,
      this.warningFactory,
      this.allJobs,
      jobDependencies
    );
  }
}
