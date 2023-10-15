import DebugRepo from 'command/DebugRepo';
import getContextStub from 'test-tool/helper/getContextStub';
import JobProviderFactory from 'job/JobProviderFactory';
import container from 'common/TestAppRoot';

let debugRepo: DebugRepo;
let jobProviderFactory: JobProviderFactory;

describe('DebugRepo command', () => {
  beforeEach(() => {
    jobProviderFactory = container.jobProviderFactory;
    debugRepo = container.debugRepo;
  });

  test('selects the repo if there is a path', () => {
    const updateSpy = jest.fn().mockImplementationOnce(async () => null);
    const contextStub = {
      ...getContextStub(),
      globalState: {
        ...getContextStub().globalState,
        update: updateSpy,
        get: async () => null,
      },
    };

    const jobProvider = jobProviderFactory.create(contextStub);
    const uriStub = {
      fsPath: 'foo/example',
      scheme: '',
      authority: '',
      path: '',
      query: '',
      fragment: '',
      with: () => uriStub,
      toJSON: () => '',
    };
    jobProvider.hardRefresh = jest.fn();

    debugRepo.getCallback(contextStub, jobProvider)(uriStub);
    expect(updateSpy).toHaveBeenCalled();
    expect(jobProvider.hardRefresh).toHaveBeenCalled;
  });
});
