import type { Catalog, Model, Mode, CapabilitySpec } from '../../types/backend';
// 后端 imageSizeOptionConstraint 对仅含 * 的旧配置发布这组标准选项。
const standardImageSizes = [
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '16:9',
  '21:9',
  '9:16',
  '1024x1024',
  '1536x1024',
  '1024x1536',
];
export const isMode = (value: string): value is Mode => ['text', 'image', 'video'].includes(value);
export function normalizeCatalog(catalog: Catalog): Model[] {
  if (catalog.source === 'frontend')
    return (catalog.models || [])
      .filter((m) => m.available && isMode(m.capability))
      .map((m) => ({
        id: m.id,
        name: m.name,
        mode: m.capability as Mode,
        modelKey: m.code,
        logicalModelId: m.id,
        spec: m.capabilitySpec,
        profiles: m.capabilityProfiles,
        defaults: m.defaultOptions || {},
      }));
  return (catalog.channels || []).flatMap((channel) =>
    channel.models
      .filter((m) => m.available && isMode(m.capability))
      .flatMap((m) => {
        const mode = m.capability as Mode;
        const raw = m.capabilityConfig;
        const capability = raw?.[mode];
        // 缺少能力合同的渠道不猜测供应商默认值。
        if (!capability || !m.protocol) return [];
        const spec: CapabilitySpec = {
          inputs: {
            video: { min: 0, max: capability.references.maxVideos || 0 },
            audio: { min: 0, max: capability.references.maxAudios || 0 },
            image: {
              min: capability.references.minImages || 0,
              max: capability.references.maxImages,
            },
          },
          options: {},
        };
        const defaults: Record<string, unknown> = {};
        if (mode === 'image' && raw?.image) {
          const image = raw.image;
          if (image.size.parameter !== 'none') {
            const sizes = image.size.values.filter((v) => v !== '*');
            if (image.size.allowCustom) {
              if (!sizes.length) sizes.push(...standardImageSizes);
              const defaultSize = m.defaultOptions?.size || image.size.default;
              if (typeof defaultSize === 'string' && defaultSize && defaultSize !== '*')
                sizes.push(defaultSize);
              if (image.size.parameter === 'size')
                sizes.push(...(image.size.presets || []).map((preset) => preset.size));
            }
            spec.options!.size = {
              values: [...new Set(sizes)],
            };
            defaults.size = image.size.default;
          }
          if (image.quality.supported) {
            spec.options!.quality = { values: image.quality.values };
            defaults.quality = image.quality.default;
          }
          spec.options!.count = {
            min: 1,
            max: Math.min(15, image.maxOutputs),
            step: 1,
          };
          if (image.transparentBackground?.supported) {
            spec.options!.transparentBackground = { values: [false, true] };
            defaults.transparentBackground = image.transparentBackground.default;
          }
        }
        if (mode === 'video' && raw?.video) {
          const video = raw.video;
          spec.operations = video.operations;
          if (video.ratios.length) {
            spec.options!.size = { values: video.ratios };
            defaults.size = video.defaultRatio;
          }
          if (video.resolutions.length) {
            spec.options!.vquality = { values: video.resolutions };
            defaults.vquality = video.defaultResolution;
          }
          if (video.durationSupported !== false) {
            spec.options!.videoSeconds = video.duration;
            defaults.videoSeconds = video.duration.default;
          }
          if (video.generateAudio?.supported) {
            spec.options!.videoGenerateAudio = { values: [false, true] };
            defaults.videoGenerateAudio = video.generateAudio.default;
          }
          if (video.watermark?.supported) {
            spec.options!.videoWatermark = { values: [false, true] };
            defaults.videoWatermark = video.watermark.default;
          }
        }
        return [
          {
            id: `${channel.id}:${m.id}`,
            name: m.displayName || m.modelKey,
            mode,
            modelKey: m.modelKey,
            channelId: channel.id,
            protocol: m.protocol,
            spec,
            defaults: { ...defaults, ...m.defaultOptions },
            rawCapabilities: raw,
            promptMaxChars: capability.references.promptMaxChars,
            maxImageBytes: capability.references.maxImageBytes,
            maxVideoBytes: capability.references.maxVideoBytes,
            maxAudioBytes: capability.references.maxAudioBytes,
          },
        ];
      }),
  );
}
export const optionLabels: Record<string, string> = {
  size: '画面比例 / 尺寸',
  quality: '图片质量',
  videoSeconds: '视频时长（秒）',
  vquality: '视频分辨率',
  count: '生成数量',
  transparentBackground: '透明背景',
  videoGenerateAudio: '同步生成音频',
  videoWatermark: '视频水印',
};
export function parameterFields(model?: Model) {
  return Object.entries(model?.spec.options || {})
    .filter(([key]) => key in optionLabels)
    .map(([key, constraint]) => {
      const values =
        constraint.values?.filter((v) => ['string', 'number', 'boolean'].includes(typeof v)) || [];
      if (!values.length && constraint.min !== undefined && constraint.max !== undefined) {
        const step = Math.max(1, constraint.step || 1);
        for (
          let value = constraint.min;
          value <= constraint.max && values.length < 100;
          value += step
        )
          values.push(value);
      }
      return {
        key,
        label: optionLabels[key],
        values: values as Array<string | number | boolean>,
        labels: values.map((value) => {
          if (typeof value === 'boolean') return value ? '开启' : '关闭';
          const preset =
            key === 'size'
              ? model?.rawCapabilities?.image?.size.presets?.find((item) => item.size === value)
              : undefined;
          return preset
            ? `${preset.tier.toUpperCase()} · ${preset.ratio} · ${value}`
            : String(value);
        }),
      };
    })
    .filter((field) => field.values.length);
}
export function defaultParameters(model?: Model): Record<string, unknown> {
  return Object.fromEntries(
    parameterFields(model).map((field) => [
      field.key,
      field.values.includes(model?.defaults[field.key] as string)
        ? model!.defaults[field.key]
        : field.values[0],
    ]),
  );
}
export const operationFor = (mode: Mode, images: number, videos = 0, audios = 0) =>
  mode !== 'video'
    ? mode
    : videos || images > 2
      ? 'reference_to_video'
      : images
        ? 'image_to_video'
        : audios
          ? 'audio_to_video'
          : 'text_to_video';
export function validateModel(
  model: Model,
  prompt: string,
  images: number,
  options: Record<string, unknown>,
  media: { videos: number; audios: number } = { videos: 0, audios: 0 },
) {
  if (!prompt.trim()) throw new Error('请填写创作描述');
  if (model.promptMaxChars && prompt.length > model.promptMaxChars)
    throw new Error(`描述最多 ${model.promptMaxChars} 字`);
  const specs = model.profiles?.length ? model.profiles : [model.spec];
  const matches = (spec: CapabilitySpec) => {
    if (
      spec.operations?.length &&
      !spec.operations.includes(operationFor(model.mode, images, media.videos, media.audios))
    )
      return false;
    for (const [kind, count] of Object.entries({
      image: images,
      video: media.videos,
      audio: media.audios,
    })) {
      if (count < (spec.inputs?.[kind]?.min || 0) || count > (spec.inputs?.[kind]?.max || 0))
        return false;
    }
    return Object.entries(options).every(([key, value]) => {
      const limit = spec.options?.[key];
      if (!limit) return false;
      if (limit.values?.length) return limit.values.includes(value);
      if (typeof value !== 'number') return false;
      return (
        (limit.min === undefined || value >= limit.min) &&
        (limit.max === undefined || value <= limit.max) &&
        (!limit.step ||
          Math.abs(
            (value - (limit.min || 0)) / limit.step -
              Math.round((value - (limit.min || 0)) / limit.step),
          ) < 1e-7)
      );
    });
  };
  if (!specs.some(matches)) throw new Error('当前模型不支持这一组参数或参考素材组合，请调整后重试');
}
