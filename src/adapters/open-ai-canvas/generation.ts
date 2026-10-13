import type { Model, ImageReference, MediaReferences } from '../../types/backend';
import { validateModel, operationFor } from './model-capabilities';
import { clientSource } from '../../core/runtime';
export type HistoryMessage = { role: 'user' | 'assistant'; content: string };
export function generationPayload(
  model: Model,
  prompt: string,
  references: ImageReference[],
  options: Record<string, unknown>,
  history: HistoryMessage[] = [],
  metadata: Record<string, unknown> = {},
  media: MediaReferences = { videos: [], audios: [] },
) {
  validateModel(model, prompt, references.length, options, {
    videos: media.videos.length,
    audios: media.audios.length,
  });
  // Go providerConfig 的数量、时长及开关为字符串，能力匹配参数仍保留原始类型。
  const providerOptions = Object.fromEntries(
    Object.entries(options).map(([key, value]) => [key, String(value)]),
  );
  const config = model.logicalModelId
    ? providerOptions
    : {
        ...providerOptions,
        channelId: model.channelId,
        interfaceType: model.protocol,
        model: model.modelKey,
        capabilityConfig: model.rawCapabilities,
      };
  return {
    type: `canvas_${model.mode}`,
    operation: operationFor(
      model.mode,
      references.length,
      media.videos.length,
      media.audios.length,
    ),
    prompt: prompt.trim(),
    model: model.modelKey,
    ...(model.logicalModelId ? { logicalModelId: model.logicalModelId } : {}),
    input: {
      mode: model.mode,
      prompt: prompt.trim(),
      config,
      ...(model.logicalModelId ? { capabilityOptions: options } : {}),
      referenceImages: references,
      referenceVideos: media.videos,
      referenceAudios: media.audios,
      textHistory: history,
      ...(model.mode === 'text'
        ? {
            textOptions: {
              stream: model.rawCapabilities?.text?.streaming !== false,
              thinking: false,
            },
          }
        : {}),
      metadata: { source: clientSource(), ...metadata },
    },
  };
}
