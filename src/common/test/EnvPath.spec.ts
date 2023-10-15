import EnvPath from 'common/EnvPath';
import OsGateway from 'gateway/OsGateway';
import ProcessGateway from 'gateway/ProcessGateway';
import getContainer from 'test-tool/TestRoot';

let envPath: EnvPath;
let osGateway: OsGateway;
let processGateway: ProcessGateway;

describe('EnvPath', () => {
  beforeEach(() => {
    const container = getContainer();
    envPath = container.envPath;
    osGateway = container.osGateway;
    processGateway = container.processGateway;
  });

  describe('get', () => {
    test('on Linux', () => {
      osGateway.os.type = jest.fn().mockImplementationOnce(() => 'Linux');
      processGateway.process.env = { PATH: '' };

      expect(envPath.get()).toEqual('');
    });

    test('on Mac without the bin path', () => {
      osGateway.os.type = jest.fn().mockImplementationOnce(() => 'Darwin');
      processGateway.process.env = { PATH: 'Users/Foo/' };

      expect(envPath.get()).toEqual('Users/Foo/:/usr/local/bin');
    });

    test('on Mac with the bin path', () => {
      osGateway.os.type = jest.fn().mockImplementationOnce(() => 'Darwin');
      processGateway.process.env = { PATH: 'Users/Foo/:/usr/local/bin' };

      expect(envPath.get()).toEqual('Users/Foo/:/usr/local/bin');
    });
  });

  describe('isMac', () => {
    test('mac', () => {
      osGateway.os.type = () => 'Darwin';
      expect(envPath.isMac());
    });

    test('linux', () => {
      osGateway.os.type = () => 'Linux';
      expect(envPath.isMac()).toEqual(false);
    });

    test('windows', () => {
      osGateway.os.type = () => 'Windows_NT';
      expect(envPath.isMac()).toEqual(false);
    });
  });
});
