import EditorGateway from 'gateway/EditorGateway';
import CommandDecorators from '../CommandDecorators';
import getContainer from 'test-tool/TestRoot';

let editorGateway: EditorGateway;
let commandDecorators: CommandDecorators;

describe('CommandDecorators', () => {
  beforeEach(() => {
    const container = getContainer();
    editorGateway = container.editorGateway;
    commandDecorators = container.commandDecorators;
  });

  test('neither pre nor post command enabled', () => {
    expect(commandDecorators.get()).toEqual({
      getPreCommand: '',
      getPostCommand: '',
      evalPreCommand: '',
      evalPostCommand: '',
    });
  });

  test('both pre and post command enabled', () => {
    // @ts-expect-error stub is missing properties.
    editorGateway.editor.workspace.getConfiguration = jest.fn(() => {
      return {
        get: (configuration: string) => {
          return [
            'command.job.enable-pre-command',
            'command.job.enable-post-command',
          ].includes(configuration);
        },
      };
    });

    expect(commandDecorators.get()).toEqual({
      getPreCommand: `echo "Please enter what you want to run before the job command (this will appear in stdout):"; read pre_command;`,
      getPostCommand: `echo "Please enter what you want to run after the job command, followed by enter (you will not see anything as you type):"; read -s post_command;`,
      evalPreCommand: `eval $pre_command`,
      evalPostCommand: `eval $post_command`,
    });
  });
});
