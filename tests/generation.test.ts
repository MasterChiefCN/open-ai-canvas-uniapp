import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  available: vi.fn(),
  remember: vi.fn(),
  balance: vi.fn(),
  epoch: 1,
}));
vi.mock('../src/api/tasks', () => ({ taskApi: { list: mocks.list, create: mocks.create } }));
vi.mock('../src/api/models', () => ({ modelApi: { available: mocks.available } }));
vi.mock('../src/stores/tasks', () => ({ useTasks: () => ({ remember: mocks.remember }) }));
vi.mock('../src/stores/auth', () => ({
  useAuth: () => ({ session: { runtimeLimits: { activeTaskLimit: 5 } } }),
}));
vi.mock('../src/stores/wallet', () => ({ useWallet: () => ({ balance: mocks.balance }) }));
vi.mock('../src/core/http', () => ({
  requestEpoch: () => mocks.epoch,
  assertEpoch: (value: number) => {
    if (value !== mocks.epoch) throw new Error('stale');
  },
}));
import { generate } from '../src/services/generation';
import type { Model } from '../src/types/backend';
const model: Model = {
  id: 'm',
  logicalModelId: 'm',
  name: 'Image',
  modelKey: 'image',
  mode: 'image',
  spec: { options: { count: { min: 1, max: 5, step: 1 } } },
  defaults: { count: 1 },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.epoch = 1;
  mocks.list.mockResolvedValue([]);
  mocks.balance.mockResolvedValue(undefined);
  mocks.available.mockResolvedValue({
    source: 'frontend',
    models: [
      {
        id: 'm',
        code: 'image',
        name: 'Image',
        capability: 'image',
        available: true,
        capabilitySpec: model.spec,
        defaultOptions: {},
      },
    ],
  });
});
describe('batch submission', () => {
  it('records accepted tasks immediately and stops after an ambiguous failure', async () => {
    mocks.create
      .mockResolvedValueOnce({ id: 'accepted' })
      .mockRejectedValueOnce(new Error('timeout'));
    const result = await generate(model, 'prompt', [], { count: 3 }, []);
    expect(result.tasks).toEqual([{ id: 'accepted' }]);
    expect(result.error).toBe('timeout');
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.remember).toHaveBeenCalledWith({ id: 'accepted' });
    expect(mocks.create.mock.calls[0][0].input.config.count).toBe(1);
    expect(mocks.create.mock.calls[0][0].input.metadata).toMatchObject({
      batchIndex: 0,
      batchCount: 3,
    });
  });
  it('does not submit above the runtime task limit', async () => {
    mocks.list.mockResolvedValue(new Array(4).fill({ status: 'running' }));
    await expect(generate(model, 'prompt', [], { count: 2 }, [])).rejects.toThrow('最多同时运行');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rechecks available models before a write', async () => {
    mocks.available.mockResolvedValue({ source: 'frontend', models: [] });
    await expect(generate(model, 'prompt', [], { count: 1 }, [])).rejects.toThrow('暂不可用');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('does not hide a successful task when the balance refresh fails', async () => {
    mocks.create.mockResolvedValue({ id: 'accepted' });
    mocks.balance.mockRejectedValue(new Error('offline'));
    expect((await generate(model, 'prompt', [], { count: 1 }, [])).tasks).toEqual([
      { id: 'accepted' },
    ]);
  });
});
