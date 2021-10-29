import * as path from 'path';
import * as vscode from 'vscode';
import { SELECTED_CONFIG_PATH } from '../constants';

export default async function getAllConfigFilePaths(
  context: vscode.ExtensionContext
): Promise<ConfigFileQuickPick[]> {
  const configFiles = await vscode.workspace.findFiles(
    '**/.circleci/config.yml',
    '**/{node_modules,vendor}/**'
  );

  const selectedConfigPath = context.globalState.get(SELECTED_CONFIG_PATH);
  return configFiles
    .sort((first, second) => {
      if (!selectedConfigPath) {
        return 0;
      }

      if (first.fsPath === selectedConfigPath) {
        return -1;
      }

      if (second.fsPath === selectedConfigPath) {
        return 1;
      }

      return 0;
    })
    .map((configFile) => ({
      label: path.basename(path.dirname(path.dirname(configFile.fsPath))),
      description: vscode.workspace.asRelativePath(configFile.fsPath),
      fsPath: configFile.fsPath,
    }));
}
