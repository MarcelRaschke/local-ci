import * as assert from 'assert';
import * as mocha from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
  CACHED_LICENSE_VALIDITY,
  LICENSE_VALIDITY_CACHED_TIME,
} from '../../../constants';
import { Substitute } from '@fluffy-spoon/substitute';
import isLicenseValid from '../../../utils/isLicenseValid';

mocha.afterEach(() => {
  sinon.restore();
});
const getMockContext = () => Substitute.for<vscode.ExtensionContext>();

suite('isLicenseValid', () => {
  test('no license key', async () => {
    assert.strictEqual(await isLicenseValid(getMockContext(), ''), false);
  });

  test('cached license validation', async () => {
    const mockContext = getMockContext();

    assert.strictEqual(
      await isLicenseValid({
        ...mockContext,
        globalState: {
          ...mockContext.globalState,
          get: (stateKey: string) => {
            if (stateKey === CACHED_LICENSE_VALIDITY) {
              return true;
            }
            if (stateKey === LICENSE_VALIDITY_CACHED_TIME) {
              return new Date().getTime();
            }
          },
          keys: () => ['foo'],
          update: async () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
          setKeysForSync: sinon.mock(),
        },
        secrets: {
          ...mockContext.secrets,
          delete: async () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
          get: async () => '',
          store: sinon.mock(),
        },
      }),
      true
    );
  });
});
