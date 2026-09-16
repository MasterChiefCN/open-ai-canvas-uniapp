import type { Model, ImageReference, MediaReferences } from '../../types/backend';
import { validateModel, operationFor } from './model-capabilities';
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
  const config = model.logicalModelId
    ? { ...options }
    : {
        ...options,
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
      ...(model.mode === 'text' ? { textOptions: { stream: true, thinking: false } } : {}),
      metadata: { source: 'uniapp-wechat', ...metadata },
    },
  };
}
