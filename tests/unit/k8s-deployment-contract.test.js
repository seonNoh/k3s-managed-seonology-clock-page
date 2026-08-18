import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';
import { describe, it } from 'vitest';

const deployment = load(readFileSync(resolve(process.cwd(), 'k8s/deployment.yaml'), 'utf8'));
const podSpec = deployment.spec.template.spec;
const container = podSpec.containers.find(({ name }) => name === 'seonology-clock-page');

const envByName = new Map(container.env.map((entry) => [entry.name, entry]));
const volumeByName = new Map(podSpec.volumes.map((entry) => [entry.name, entry]));
const mountByName = new Map(container.volumeMounts.map((entry) => [entry.name, entry]));

describe('reference Kubernetes deployment contract', () => {
  it('requires the cloud token encryption key from the managed Secret', () => {
    assert.deepEqual(envByName.get('CLOUD_TOKEN_ENCRYPTION_KEY'), {
      name: 'CLOUD_TOKEN_ENCRYPTION_KEY',
      valueFrom: {
        secretKeyRef: {
          name: 'clock-page-secrets',
          key: 'cloud-token-encryption-key',
          optional: false,
        },
      },
    });
  });

  it('persists application data through the /data PVC contract', () => {
    assert.deepEqual(envByName.get('BOOKMARKS_DIR'), {
      name: 'BOOKMARKS_DIR',
      value: '/data',
    });
    assert.deepEqual(mountByName.get('bookmarks-data'), {
      name: 'bookmarks-data',
      mountPath: '/data',
    });
    assert.deepEqual(volumeByName.get('bookmarks-data'), {
      name: 'bookmarks-data',
      persistentVolumeClaim: {
        claimName: 'clock-bookmarks-pvc',
      },
    });
  });

  it('runs the pod and container with the restricted security contract', () => {
    assert.equal(podSpec.securityContext.runAsNonRoot, true);
    assert.equal(podSpec.securityContext.runAsUser, 10001);
    assert.equal(podSpec.securityContext.runAsGroup, 10001);
    assert.equal(podSpec.securityContext.fsGroup, 10001);
    assert.equal(podSpec.securityContext.fsGroupChangePolicy, 'OnRootMismatch');
    assert.equal(podSpec.securityContext.seccompProfile.type, 'RuntimeDefault');
    assert.equal(container.securityContext.allowPrivilegeEscalation, false);
    assert.equal(container.securityContext.readOnlyRootFilesystem, true);
    assert.deepEqual(container.securityContext.capabilities.drop, ['ALL']);
    assert.equal(container.securityContext.seccompProfile.type, 'RuntimeDefault');
  });
});
