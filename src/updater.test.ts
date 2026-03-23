import { beforeEach, describe, expect, it, mock } from 'bun:test';

const loadConfigMock =
  mock<
    () => Promise<{
      apiKey: string;
      accountId?: string;
      zones: Array<{ zoneId: string; zoneName: string; selectedRecordIds: string[] }>;
      accessPolicies?: Array<{
        appId: string;
        appName: string;
        policyId: string;
        policyName: string;
      }>;
      updateInterval?: number;
      discordWebhookUrl?: string;
      slackWebhookUrl?: string;
    } | null>
  >();
const getPublicIPsMock = mock<() => Promise<{ ipv4?: string; ipv6?: string }>>();
const sendNotificationMock =
  mock<
    (
      notification: {
        type: 'dns_update' | 'access_update' | 'dns_failed' | 'access_failed';
        zoneName?: string;
        recordName?: string;
        appName?: string;
        policyName?: string;
        oldIP: string;
        newIP: string;
        error?: string;
        timestamp: string;
      },
      config?: { discordWebhookUrl?: string; slackWebhookUrl?: string }
    ) => Promise<void>
  >();
const getDNSRecordsMock =
  mock<
    (
      zoneId: string,
      type?: 'A' | 'AAAA'
    ) => Promise<
      Array<{
        id: string;
        type: string;
        name: string;
        content: string;
        proxied: boolean;
        ttl: number;
      }>
    >
  >();
const updateDNSRecordMock =
  mock<
    (
      zoneId: string,
      recordId: string,
      content: string,
      name: string,
      type: 'A' | 'AAAA',
      proxied: boolean,
      ttl: number
    ) => Promise<void>
  >();
const getAccessPoliciesMock =
  mock<
    (
      accountId: string,
      appId: string
    ) => Promise<
      Array<{
        id: string;
        name: string;
        decision: 'allow' | 'deny' | 'non_identity' | 'bypass';
        include: Array<{ ip?: { ip: string } }>;
        reusable?: boolean;
      }>
    >
  >();
const updateAccessPolicyMock =
  mock<
    (
      accountId: string,
      appId: string,
      policyId: string,
      newIp: string,
      policyData: {
        id: string;
        name: string;
        decision: 'allow' | 'deny' | 'non_identity' | 'bypass';
        include: Array<{ ip?: { ip: string } }>;
        reusable?: boolean;
      }
    ) => Promise<void>
  >();

const createSpinnerMock =
  mock<
    (_opts: { text: string; discardStdin: boolean }) => {
      start: () => {
        stop: () => void;
        succeed: (_msg?: string) => void;
        fail: (_msg?: string) => void;
      };
    }
  >();

const createCloudflareServiceMock =
  mock<
    (_apiKey: string) => {
      getDNSRecords: typeof getDNSRecordsMock;
      updateDNSRecord: typeof updateDNSRecordMock;
      getAccessPolicies: typeof getAccessPoliciesMock;
      updateAccessPolicy: typeof updateAccessPolicyMock;
    }
  >();

const { __testOnly, runSingleUpdate, startUpdateLoop } = await import('./updater.js');

function makeDeps() {
  return {
    loadConfig: loadConfigMock,
    getPublicIPs: getPublicIPsMock,
    sendNotification: sendNotificationMock as never,
    createCloudflareService: createCloudflareServiceMock,
    createSpinner: createSpinnerMock as never,
  };
}

beforeEach(() => {
  loadConfigMock.mockReset();
  getPublicIPsMock.mockReset();
  sendNotificationMock.mockReset();
  getDNSRecordsMock.mockReset();
  updateDNSRecordMock.mockReset();
  getAccessPoliciesMock.mockReset();
  updateAccessPolicyMock.mockReset();
  createSpinnerMock.mockReset();
  createCloudflareServiceMock.mockReset();

  createSpinnerMock.mockReturnValue({
    start: () => ({
      stop: () => {},
      succeed: () => {},
      fail: () => {},
    }),
  });

  createCloudflareServiceMock.mockReturnValue({
    getDNSRecords: getDNSRecordsMock,
    updateDNSRecord: updateDNSRecordMock,
    getAccessPolicies: getAccessPoliciesMock,
    updateAccessPolicy: updateAccessPolicyMock,
  });
});

describe('updater', () => {
  it('creates a default Cloudflare service from internal deps', () => {
    const service = __testOnly.defaultDeps.createCloudflareService('token-1');

    expect(service).toBeDefined();
    expect(typeof service.getDNSRecords).toBe('function');
    expect(typeof service.updateDNSRecord).toBe('function');
    expect(typeof service.getAccessPolicies).toBe('function');
    expect(typeof service.updateAccessPolicy).toBe('function');
  });

  it('throws when runSingleUpdate is called without config', async () => {
    loadConfigMock.mockResolvedValue(null);

    await expect(runSingleUpdate(makeDeps())).rejects.toThrow('No configuration found');
  });

  it('updates changed A records and skips AAAA records when IPv6 is missing', async () => {
    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      zones: [
        {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          selectedRecordIds: ['r-a-update', 'r-aaaa-no-v6'],
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({ ipv4: '203.0.113.10' });
    getDNSRecordsMock.mockImplementation(async (_zoneId, type) => {
      if (type === 'A') {
        return [
          {
            id: 'r-a-update',
            type: 'A',
            name: 'home.example.com',
            content: '203.0.113.5',
            proxied: false,
            ttl: 120,
          },
        ];
      }

      return [
        {
          id: 'r-aaaa-no-v6',
          type: 'AAAA',
          name: 'v6.example.com',
          content: '2001:db8::5',
          proxied: false,
          ttl: 1,
        },
      ];
    });
    updateDNSRecordMock.mockResolvedValue();

    await runSingleUpdate(makeDeps());

    expect(updateDNSRecordMock).toHaveBeenCalledTimes(1);
    expect(updateDNSRecordMock.mock.calls[0]?.slice(0, 5)).toEqual([
      'zone-1',
      'r-a-update',
      '203.0.113.10',
      'home.example.com',
      'A',
    ]);
  });

  it('continues and reports failure when DNS update throws', async () => {
    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      zones: [
        {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          selectedRecordIds: ['r-a-fail'],
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({ ipv4: '203.0.113.10' });
    getDNSRecordsMock.mockImplementation(async (_zoneId, type) => {
      if (type === 'A') {
        return [
          {
            id: 'r-a-fail',
            type: 'A',
            name: 'fail.example.com',
            content: '203.0.113.1',
            proxied: false,
            ttl: 1,
          },
        ];
      }
      return [];
    });
    updateDNSRecordMock.mockRejectedValue(new Error('update exploded'));

    await expect(runSingleUpdate(makeDeps())).resolves.toBeUndefined();
    expect(updateDNSRecordMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('keeps unchanged DNS records without update calls', async () => {
    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      zones: [
        {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          selectedRecordIds: ['r-a-unchanged', 'r-aaaa-unchanged'],
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({
      ipv4: '203.0.113.10',
      ipv6: '2001:db8::10',
    });
    getDNSRecordsMock.mockImplementation(async (_zoneId, type) => {
      if (type === 'A') {
        return [
          {
            id: 'r-a-unchanged',
            type: 'A',
            name: 'home.example.com',
            content: '203.0.113.10',
            proxied: false,
            ttl: 1,
          },
        ];
      }
      return [
        {
          id: 'r-aaaa-unchanged',
          type: 'AAAA',
          name: 'v6.example.com',
          content: '2001:db8::10',
          proxied: false,
          ttl: 1,
        },
      ];
    });

    await runSingleUpdate(makeDeps());

    expect(updateDNSRecordMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('handles DNS listing failure for a zone without throwing', async () => {
    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      zones: [
        {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          selectedRecordIds: ['r-a-any'],
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({ ipv4: '203.0.113.10' });
    getDNSRecordsMock.mockRejectedValue(new Error('dns list failed'));

    await expect(runSingleUpdate(makeDeps())).resolves.toBeUndefined();
    expect(updateDNSRecordMock).not.toHaveBeenCalled();
  });

  it('updates matching Access policy and preserves CIDR suffix', async () => {
    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      accountId: 'account-1',
      zones: [],
      accessPolicies: [
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-1',
          policyName: 'Allow Home',
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({ ipv4: '203.0.113.99' });
    getAccessPoliciesMock.mockResolvedValue([
      {
        id: 'policy-1',
        name: 'Allow Home',
        decision: 'allow',
        include: [{ ip: { ip: '203.0.113.10/32' } }],
      },
    ]);
    updateAccessPolicyMock.mockResolvedValue();

    await runSingleUpdate(makeDeps());

    expect(updateAccessPolicyMock).toHaveBeenCalledTimes(1);
    expect(updateAccessPolicyMock.mock.calls[0]?.[0]).toBe('account-1');
    expect(updateAccessPolicyMock.mock.calls[0]?.[1]).toBe('app-1');
    expect(updateAccessPolicyMock.mock.calls[0]?.[2]).toBe('policy-1');
    expect(updateAccessPolicyMock.mock.calls[0]?.[3]).toBe('203.0.113.99/32');
  });

  it('returns early for Access updates when IPv4 is unavailable', async () => {
    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      accountId: 'account-1',
      zones: [],
      accessPolicies: [
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-1',
          policyName: 'Allow Home',
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({});

    await runSingleUpdate(makeDeps());

    expect(getAccessPoliciesMock).not.toHaveBeenCalled();
    expect(updateAccessPolicyMock).not.toHaveBeenCalled();
  });

  it('treats matching normalized Access IP as unchanged', async () => {
    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      accountId: 'account-1',
      zones: [],
      accessPolicies: [
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-1',
          policyName: 'Allow Home',
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({ ipv4: '203.0.113.10' });
    getAccessPoliciesMock.mockResolvedValue([
      {
        id: 'policy-1',
        name: 'Allow Home',
        decision: 'allow',
        include: [{ ip: { ip: '203.0.113.10/32' } }],
      },
    ]);

    await runSingleUpdate(makeDeps());

    expect(updateAccessPolicyMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('records Access failure when configured policy is not found', async () => {
    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      accountId: 'account-1',
      zones: [],
      accessPolicies: [
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-missing',
          policyName: 'Missing Policy',
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({ ipv4: '203.0.113.10' });
    getAccessPoliciesMock.mockResolvedValue([]);

    await runSingleUpdate(makeDeps());

    expect(updateAccessPolicyMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('sends access_failed notification when Access policy update throws', async () => {
    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      accountId: 'account-1',
      zones: [],
      accessPolicies: [
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-1',
          policyName: 'Allow Home',
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({ ipv4: '203.0.113.99' });
    getAccessPoliciesMock.mockResolvedValue([
      {
        id: 'policy-1',
        name: 'Allow Home',
        decision: 'allow',
        include: [{ ip: { ip: '203.0.113.10/32' } }],
      },
    ]);
    updateAccessPolicyMock.mockRejectedValue(new Error('access update failed'));

    await runSingleUpdate(makeDeps());

    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock.mock.calls[0]?.[0]).toMatchObject({
      type: 'access_failed',
      policyName: 'Allow Home',
      error: 'access update failed',
    });
  });

  it('handles Access policy list failure for an app without throwing', async () => {
    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      accountId: 'account-1',
      zones: [],
      accessPolicies: [
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-1',
          policyName: 'Allow Home',
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({ ipv4: '203.0.113.99' });
    getAccessPoliciesMock.mockRejectedValue(new Error('access list failed'));

    await expect(runSingleUpdate(makeDeps())).resolves.toBeUndefined();
    expect(updateAccessPolicyMock).not.toHaveBeenCalled();
  });

  it('runs startUpdateLoop in TTY mode and exits on q input', async () => {
    const originalStdin = process.stdin;
    const originalIsTTY = process.stdin.isTTY;
    const setRawMode = mock<(_mode: boolean) => void>();
    const resume = mock<() => void>();
    const pause = mock<() => void>();
    let listener: ((chunk: Buffer) => void) | undefined;

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    process.stdin.setRawMode = setRawMode as never;
    process.stdin.resume = resume as never;
    process.stdin.pause = pause as never;
    process.stdin.on = ((event: string, cb: (chunk: Buffer) => void) => {
      if (event === 'data') {
        listener = cb;
        cb(Buffer.from('q'));
      }
      return process.stdin;
    }) as never;
    process.stdin.removeListener = ((event: string, cb: (chunk: Buffer) => void) => {
      if (event === 'data' && listener === cb) {
        listener = undefined;
      }
      return process.stdin;
    }) as never;

    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      updateInterval: 5,
      accountId: 'account-1',
      zones: [
        {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          selectedRecordIds: ['r-a-ok', 'r-a-same', 'r-a-fail', 'r-aaaa-no-v6'],
        },
      ],
      accessPolicies: [
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-ok',
          policyName: 'Allow Home',
        },
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-same',
          policyName: 'No Change',
        },
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-fail',
          policyName: 'Will Fail',
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({ ipv4: '203.0.113.50' });
    getDNSRecordsMock.mockImplementation(async (_zoneId, type) => {
      if (type === 'A') {
        return [
          {
            id: 'r-a-ok',
            type: 'A',
            name: 'ok.example.com',
            content: '203.0.113.10',
            proxied: false,
            ttl: 1,
          },
          {
            id: 'r-a-same',
            type: 'A',
            name: 'same.example.com',
            content: '203.0.113.50',
            proxied: false,
            ttl: 1,
          },
          {
            id: 'r-a-fail',
            type: 'A',
            name: 'fail.example.com',
            content: '203.0.113.11',
            proxied: false,
            ttl: 1,
          },
        ];
      }

      return [
        {
          id: 'r-aaaa-no-v6',
          type: 'AAAA',
          name: 'v6.example.com',
          content: '2001:db8::10',
          proxied: false,
          ttl: 1,
        },
      ];
    });
    updateDNSRecordMock.mockImplementation(async (_z, recordId) => {
      if (recordId === 'r-a-fail') {
        throw new Error('dns update failed');
      }
    });
    getAccessPoliciesMock.mockResolvedValue([
      {
        id: 'policy-ok',
        name: 'Allow Home',
        decision: 'allow',
        include: [{ ip: { ip: '203.0.113.10/32' } }],
      },
      {
        id: 'policy-same',
        name: 'No Change',
        decision: 'allow',
        include: [{ ip: { ip: '203.0.113.50/32' } }],
      },
      {
        id: 'policy-fail',
        name: 'Will Fail',
        decision: 'allow',
        include: [{ ip: { ip: '203.0.113.20/32' } }],
      },
    ]);
    updateAccessPolicyMock.mockImplementation(async (_acc, _app, policyId) => {
      if (policyId === 'policy-fail') {
        throw new Error('access update failed');
      }
    });

    try {
      await startUpdateLoop(undefined, makeDeps());
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
      process.stdin.setRawMode = originalStdin.setRawMode;
      process.stdin.resume = originalStdin.resume;
      process.stdin.pause = originalStdin.pause;
      process.stdin.on = originalStdin.on;
      process.stdin.removeListener = originalStdin.removeListener;
    }

    expect(setRawMode).toHaveBeenCalledWith(true);
    expect(setRawMode).toHaveBeenCalledWith(false);
    expect(resume).toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    expect(updateDNSRecordMock).toHaveBeenCalled();
    expect(updateAccessPolicyMock).toHaveBeenCalled();
  });

  it('runs at least one scheduled loop iteration before stopping', async () => {
    const originalStdin = process.stdin;
    const originalIsTTY = process.stdin.isTTY;
    const originalDateNow = Date.now;
    const originalSetTimeout = globalThis.setTimeout;

    const setRawMode = mock<(_mode: boolean) => void>();
    const resume = mock<() => void>();
    const pause = mock<() => void>();
    let listener: ((chunk: Buffer) => void) | undefined;
    let timeoutCalls = 0;
    let nowCall = 0;

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    process.stdin.setRawMode = setRawMode as never;
    process.stdin.resume = resume as never;
    process.stdin.pause = pause as never;
    process.stdin.on = ((event: string, cb: (chunk: Buffer) => void) => {
      if (event === 'data') {
        listener = cb;
      }
      return process.stdin;
    }) as never;
    process.stdin.removeListener = ((event: string, cb: (chunk: Buffer) => void) => {
      if (event === 'data' && listener === cb) {
        listener = undefined;
      }
      return process.stdin;
    }) as never;

    Date.now = (() => {
      nowCall += 1;
      if (nowCall === 1) return 0; // initial nextCheck = intervalMs
      if (nowCall === 2) return 300000; // trigger first scheduled iteration
      if (nowCall === 3) return 300000; // compute nextCheck again
      return 0;
    }) as typeof Date.now;

    globalThis.setTimeout = ((handler: Parameters<typeof setTimeout>[0], _timeout?: number) => {
      timeoutCalls += 1;
      if (timeoutCalls === 2 && listener) {
        listener(Buffer.from('q'));
      }
      if (typeof handler === 'function') {
        handler();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    loadConfigMock.mockResolvedValue({
      apiKey: 'token-1',
      updateInterval: 5,
      accountId: 'account-1',
      zones: [
        {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          selectedRecordIds: ['r-a-ok', 'r-a-same', 'r-a-fail', 'r-aaaa-no-v6'],
        },
      ],
      accessPolicies: [
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-ok',
          policyName: 'Allow Home',
        },
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-same',
          policyName: 'No Change',
        },
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'policy-fail',
          policyName: 'Will Fail',
        },
      ],
    });
    getPublicIPsMock.mockResolvedValue({ ipv4: '203.0.113.50' });
    getDNSRecordsMock.mockImplementation(async (_zoneId, type) => {
      if (type === 'A') {
        return [
          {
            id: 'r-a-ok',
            type: 'A',
            name: 'ok.example.com',
            content: '203.0.113.10',
            proxied: false,
            ttl: 1,
          },
          {
            id: 'r-a-same',
            type: 'A',
            name: 'same.example.com',
            content: '203.0.113.50',
            proxied: false,
            ttl: 1,
          },
          {
            id: 'r-a-fail',
            type: 'A',
            name: 'fail.example.com',
            content: '203.0.113.11',
            proxied: false,
            ttl: 1,
          },
        ];
      }

      return [
        {
          id: 'r-aaaa-no-v6',
          type: 'AAAA',
          name: 'v6.example.com',
          content: '2001:db8::10',
          proxied: false,
          ttl: 1,
        },
      ];
    });
    updateDNSRecordMock.mockImplementation(async (_z, recordId) => {
      if (recordId === 'r-a-fail') {
        throw new Error('dns update failed');
      }
    });
    getAccessPoliciesMock.mockResolvedValue([
      {
        id: 'policy-ok',
        name: 'Allow Home',
        decision: 'allow',
        include: [{ ip: { ip: '203.0.113.10/32' } }],
      },
      {
        id: 'policy-same',
        name: 'No Change',
        decision: 'allow',
        include: [{ ip: { ip: '203.0.113.50/32' } }],
      },
      {
        id: 'policy-fail',
        name: 'Will Fail',
        decision: 'allow',
        include: [{ ip: { ip: '203.0.113.20/32' } }],
      },
    ]);
    updateAccessPolicyMock.mockImplementation(async (_acc, _app, policyId) => {
      if (policyId === 'policy-fail') {
        throw new Error('access update failed');
      }
    });

    try {
      await startUpdateLoop(undefined, makeDeps());
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
      process.stdin.setRawMode = originalStdin.setRawMode;
      process.stdin.resume = originalStdin.resume;
      process.stdin.pause = originalStdin.pause;
      process.stdin.on = originalStdin.on;
      process.stdin.removeListener = originalStdin.removeListener;
      Date.now = originalDateNow;
      globalThis.setTimeout = originalSetTimeout;
    }

    expect(timeoutCalls).toBeGreaterThanOrEqual(2);
    expect(setRawMode).toHaveBeenCalledWith(true);
    expect(setRawMode).toHaveBeenCalledWith(false);
  });

  it('throws when startUpdateLoop is called without any config source', async () => {
    loadConfigMock.mockResolvedValue(null);

    await expect(startUpdateLoop(undefined, makeDeps())).rejects.toThrow('No configuration found');
  });
});
