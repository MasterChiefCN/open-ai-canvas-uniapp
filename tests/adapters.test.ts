import { describe, it, expect } from 'vitest';
import {
  normalizeCatalog,
  validateModel,
  defaultParameters,
} from '../src/adapters/open-ai-canvas/model-capabilities';
import { generationPayload } from '../src/adapters/open-ai-canvas/generation';
import { parseResult, mergeText, canRetry } from '../src/adapters/open-ai-canvas/task-result';
import { safeLogs, taskParameters } from '../src/adapters/open-ai-canvas/task-details';
import type { Model, Task } from '../src/types/backend';
const model: Model = {
  id: 'logical',
  logicalModelId: 'logical',
  modelKey: 'video-model',
  name: 'Video',
  mode: 'video',
  spec: {
    operations: ['text_to_video', 'image_to_video'],
    inputs: { image: { min: 0, max: 2 } },
    options: {
      size: { values: ['16:9', '9:16'] },
      videoSeconds: { values: [5, 10] },
    },
  },
  defaults: { size: '16:9', videoSeconds: 5 },
};
const task = (extra: Partial<Task> = {}): Task => ({
  id: 't1',
  type: 'canvas_text',
  status: 'succeeded',
  prompt: 'test',
  createdAt: '',
  updatedAt: '',
  ...extra,
});
describe('capabilities and generation contracts', () => {
  it('maps logical references and operation without provider secrets', () => {
    const payload = generationPayload(
      model,
      ' sunrise ',
      [
        {
          id: 'r',
          name: 'frame',
          type: 'image/png',
          dataUrl: '',
          storageKey: 'resource:r',
        },
      ],
      defaultParameters(model),
    );
    expect(payload).toMatchObject({
      type: 'canvas_video',
      operation: 'image_to_video',
      prompt: 'sunrise',
      logicalModelId: 'logical',
      input: {
        config: { size: '16:9', videoSeconds: 5 },
        capabilityOptions: { size: '16:9', videoSeconds: 5 },
        referenceImages: [{ storageKey: 'resource:r' }],
      },
    });
    expect(JSON.stringify(payload)).not.toContain('apiKey');
    expect(JSON.stringify(payload)).not.toContain('channelId');
  });
  it('rejects unsupported parameters, references and profile combinations', () => {
    expect(() => validateModel(model, 'prompt', 3, {})).toThrow();
    expect(() => validateModel(model, 'prompt', 0, { videoSeconds: 9 })).toThrow();
    expect(() => validateModel(model, 'prompt', 0, { randomOption: true })).toThrow();
    const profiles = [
      {
        options: { size: { values: ['16:9'] }, videoSeconds: { values: [5] } },
      },
      {
        options: { size: { values: ['9:16'] }, videoSeconds: { values: [10] } },
      },
    ];
    expect(() =>
      validateModel({ ...model, profiles }, 'prompt', 0, {
        size: '16:9',
        videoSeconds: 10,
      }),
    ).toThrow();
  });
  it('makes one text task with prior conversation in textHistory', () => {
    const textModel = {
      ...model,
      mode: 'text' as const,
      spec: {},
      defaults: {},
    };
    const payload = generationPayload(textModel, '继续', [], {}, [
      { role: 'assistant', content: '前文' },
    ]);
    expect(payload.operation).toBe('text');
    expect(payload.input.textHistory).toEqual([{ role: 'assistant', content: '前文' }]);
    expect(payload.input.textOptions).toEqual({
      stream: true,
      thinking: false,
    });
  });
  it('maps system-channel capabilities and skips missing contracts', () => {
    const models = normalizeCatalog({
      source: 'system',
      channels: [
        {
          id: 'channel',
          name: '系统',
          models: [
            {
              id: 'a',
              modelKey: 'text-1',
              displayName: 'Text',
              capability: 'text',
              available: true,
              protocol: 'openai-chat',
              capabilityConfig: {
                text: {
                  references: {
                    maxImages: 0,
                    maxImageBytes: 0,
                    promptMaxChars: 1000,
                  },
                },
              },
            },
            {
              id: 'b',
              modelKey: 'unknown',
              displayName: 'Unknown',
              capability: 'image',
              available: true,
            },
          ],
        },
      ],
    });
    expect(models).toHaveLength(1);
    const payload = generationPayload(models[0], 'hello', [], {});
    expect(payload.input.config).toMatchObject({
      channelId: 'channel',
      interfaceType: 'openai-chat',
      model: 'text-1',
    });
    expect(payload).not.toHaveProperty('logicalModelId');
  });
});
describe('task result and replay', () => {
  it('supports multi-image results and resource references', () => {
    expect(
      parseResult(
        task({
          type: 'canvas_image',
          resultJson: JSON.stringify({
            images: [{ storageKey: 'resource:a' }, { dataUrl: '/api/image' }],
          }),
        }),
      ).media,
    ).toEqual([
      { kind: 'image', storageKey: 'resource:a', url: undefined },
      { kind: 'image', url: '/api/image', storageKey: undefined },
    ]);
  });
  it('does not interpret unsupported types or crash on corrupt JSON', () => {
    expect(parseResult(task({ type: 'agent', resultJson: '{"text":"hidden"}' })).text).toBe('');
    expect(parseResult(task({ resultJson: '{' })).error).toBeTruthy();
  });
  it('deduplicates unordered and overlapping text deltas', () => {
    const result = mergeText(
      { after: 1, text: 'A' },
      {
        deltas: [
          { sequence: 3, content: 'C' },
          { sequence: 1, content: 'A' },
          { sequence: 2, content: 'B' },
          { sequence: 2, content: 'B' },
        ],
        complete: false,
      },
    );
    expect(result).toEqual({ after: 3, text: 'ABC' });
    expect(mergeText(result, { deltas: [], complete: true, finalText: '' }).text).toBe('');
  });
  it('uses backend snapshot without re-appending full replay on recovery', () => {
    expect(
      mergeText(
        { after: 0, text: '' },
        {
          deltas: [{ sequence: 3, content: 'C' }],
          textDraft: 'ABC',
          complete: false,
        },
      ),
    ).toEqual({ after: 3, text: 'ABC' });
  });
  it('blocks moderation retries', () => {
    expect(canRetry(task({ status: 'failed', errorCode: 'sensitive_words_detected' }))).toBe(false);
    expect(canRetry(task({ status: 'failed', error: 'timeout' }))).toBe(true);
  });
  it('only exposes safe task parameters and log stages', () => {
    const logs = safeLogs([
      {
        level: 'error',
        message: 'failed https://private.test?key=secret',
        payload: 'apiKey=secret',
        createdAt: 'today',
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain('secret');
    expect(logs[0].stage).toBe('failed');
    expect(
      taskParameters(task({ inputJson: '{"config":{"size":"16:9","apiKey":"secret"}}' })),
    ).toEqual([{ label: '画面比例 / 尺寸', value: '16:9' }]);
  });
});
