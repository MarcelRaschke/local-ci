import { decorate, inject, injectable } from 'inversify';
import * as vscode from 'vscode';
import { CREATE_CONFIG_FILE_COMMAND, SELECTED_CONFIG_PATH } from 'constants/';
import AllConfigFiles from './AllConfigFiles';
import EditorGateway from 'common/EditorGateway';
import Types from 'common/Types';

class ConfigFile {
  allConfigFiles!: AllConfigFiles;
  editorGateway!: EditorGateway;

  /**
   * Gets the absolute path of the selected .circleci/config.yml to run the jobs on.
   *
   * Or '' if none is found.
   */
  async getPath(context: vscode.ExtensionContext): Promise<string | ''> {
    const selectedConfigPath = String(
      context.globalState.get(SELECTED_CONFIG_PATH)
    );
    const isConfigInWorkspace =
      !!selectedConfigPath &&
      !!this.editorGateway.editor.workspace.getWorkspaceFolder(
        this.editorGateway.editor.Uri.file(selectedConfigPath)
      );

    if (isConfigInWorkspace) {
      return Promise.resolve(selectedConfigPath);
    }

    const allConfigFilePaths = await this.allConfigFiles.getPaths(context);
    if (!allConfigFilePaths.length) {
      const createConfigText = 'Create a config for me';
      this.editorGateway.editor.window
        .showInformationMessage(
          `Let's get you started with a .circleci/config.yml file so you can use Local CI`,
          { detail: 'There is no config file for Local CI to run' },
          createConfigText
        )
        .then((clicked) => {
          if (clicked === createConfigText) {
            this.editorGateway.editor.commands.executeCommand(
              CREATE_CONFIG_FILE_COMMAND
            );
          }
        });

      return '';
    }

    if (allConfigFilePaths.length === 1) {
      return allConfigFilePaths[0].fsPath;
    }

    const chooseRepoText = 'Choose repo';
    this.editorGateway.editor.window
      .showInformationMessage(
        'Please select the repo to run Local CI on',
        { detail: 'There is no repo selected to run Local CI on' },
        chooseRepoText
      )
      .then((clicked) => {
        if (clicked === chooseRepoText) {
          this.editorGateway.editor.commands.executeCommand(
            'localCiJobs.selectRepo'
          );
        }
      });

    return '';
  }
}

decorate(injectable(), ConfigFile);
decorate(inject(AllConfigFiles), ConfigFile.prototype, 'allConfigFiles');
decorate(inject(Types.IEditorGateway), ConfigFile.prototype, 'editorGateway');
export default ConfigFile;
