export type Mode = 'text' | 'image' | 'video';
export type User = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
};
export type AuthSettings = {
  firstUser: boolean;
  registrationEnabled: boolean;
  emailEnabled: boolean;
  emailCodeRequired: boolean;
};
export type Session = {
  user: User | null;
  runtimeLimits?: { activeTaskLimit: number; resourceUploadMB: number };
  features?: {
    creditsEnabled?: boolean;
    taskCenterEnabled?: boolean;
    frontendModelsEnabled?: boolean;
  };
};
export type Constraint = {
  values?: unknown[];
  min?: number;
  max?: number;
  step?: number;
};
export type CapabilitySpec = {
  operations?: string[];
  inputs?: Record<string, { min: number; max: number }>;
  options?: Record<string, Constraint>;
};
export type LogicalModel = {
  id: string;
  code: string;
  name: string;
  capability: string;
  available: boolean;
  capabilitySpec: CapabilitySpec;
  capabilityProfiles?: CapabilitySpec[];
  defaultOptions: Record<string, unknown>;
};
export type ChannelCapability = {
  text?: { streaming?: boolean; references: References };
  image?: {
    references: References;
    size: { parameter: string; values: string[]; default: string };
    quality: { supported: boolean; values: string[]; default: string };
    maxOutputs: number;
  };
  video?: {
    references: References;
    duration: Constraint & { default: number };
    durationSupported?: boolean;
    ratios: string[];
    defaultRatio: string;
    resolutions: string[];
    defaultResolution: string;
    operations: string[];
  };
};
type References = {
  maxVideos?: number;
  maxVideoBytes?: number;
  maxVideoDurationSeconds?: number;
  maxAudios?: number;
  maxAudioBytes?: number;
  maxAudioDurationSeconds?: number;
  minImages?: number;
  maxImages: number;
  maxImageBytes: number;
  promptMaxChars: number;
};
export type Catalog = {
  source: 'frontend' | 'system';
  models?: LogicalModel[];
  channels?: Array<{
    id: string;
    name: string;
    models: Array<{
      id: string;
      modelKey: string;
      displayName: string;
      capability: string;
      available: boolean;
      protocol?: string;
      capabilityConfig?: ChannelCapability;
    }>;
  }>;
};
export type Model = {
  id: string;
  name: string;
  mode: Mode;
  modelKey: string;
  logicalModelId?: string;
  channelId?: string;
  protocol?: string;
  spec: CapabilitySpec;
  profiles?: CapabilitySpec[];
  defaults: Record<string, unknown>;
  rawCapabilities?: ChannelCapability;
  promptMaxChars?: number;
  maxImageBytes?: number;
  maxVideoBytes?: number;
  maxAudioBytes?: number;
};
export type Task = {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  prompt: string;
  model?: string;
  operation?: string;
  progress?: number;
  stage?: string;
  inputJson?: string;
  resultJson?: string;
  textDraft?: string;
  error?: string;
  errorCode?: string;
  providerCancelStatus?: string;
  billing?: { status: string; amountMicrocredits: number };
  createdAt: string;
  updatedAt: string;
};
export type TaskLog = {
  id: string;
  level: string;
  stage: string;
  errorCode?: string;
  createdAt: string;
  message?: string;
};
export type TextReplay = {
  deltas: Array<{ sequence: number; content: string }>;
  textDraft?: string;
  finalText?: string;
  complete: boolean;
};
export type Resource = {
  kind?: string;
  id: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  durationMs?: number;
  status?: string;
};
export type ImageReference = {
  id: string;
  name: string;
  type: string;
  dataUrl: '';
  storageKey: string;
  bytes?: number;
};
export type MediaKind = 'image' | 'video' | 'audio';
export type MediaReference = Omit<ImageReference, 'dataUrl'> & {
  url: '';
  width?: number;
  height?: number;
  durationMs?: number;
};
export type MediaReferences = { videos: MediaReference[]; audios: MediaReference[] };
export type Account = {
  availableMicrocredits: number;
  reservedMicrocredits: number;
};
export type Ledger = {
  id: string;
  type: string;
  amountMicrocredits: number;
  availableAfterMicrocredits: number;
  note?: string;
  model?: string;
  createdAt: string;
};
export type Wallet = {
  account: Account;
  entries: Ledger[];
  total: number;
  page: number;
  pageSize: number;
};
