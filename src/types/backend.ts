export type Mode = 'text' | 'image' | 'video';
export type User = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
};
export type VerificationMethod = 'sms' | 'email' | 'sms_email';
export type VerificationPolicy = {
  smsLogin: boolean;
  emailLogin: boolean;
  smsRegistration: boolean;
  emailRegistration: boolean;
  smsAndEmailRegistration: boolean;
};
export type AuthSettings = {
  firstUser: boolean;
  registrationEnabled: boolean;
  emailEnabled: boolean;
  emailCodeRequired: boolean;
  agreementTitle?: string;
  agreementContent?: string;
} & VerificationPolicy;
export type Session = {
  user: User | null;
  runtimeLimits?: { activeTaskLimit: number; resourceUploadMB: number; storedFileGB?: number };
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
    size: {
      parameter: string;
      values: string[];
      default: string;
      allowCustom?: boolean;
      presets?: Array<{ size: string; tier: string; ratio: string; width: number; height: number }>;
    };
    quality: { supported: boolean; values: string[]; default: string };
    transparentBackground?: { supported: boolean; default: boolean };
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
    generateAudio?: { supported: boolean; default: boolean };
    watermark?: { supported: boolean; default: boolean };
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
      defaultOptions?: Record<string, unknown>;
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
  mediaStage?: 'download' | 'upload' | 'local_save' | 'register' | 'completed' | 'checkpoint';
  canRecoverMedia?: boolean;
  previewUrl?: string;
  previewKind?: string;
  previewPosterUrl?: string;
  agentRunId?: string;
  generationId?: string;
  creationSubmissionId?: string;
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
export type ResourceAccessPurpose = 'display' | 'download' | 'browser-process';
export type ResourceAccessVariant = 'original' | 'playback' | 'thumbnail';
export type ResourceAccess = {
  resourceId: string;
  requestedVariant: ResourceAccessVariant;
  actualVariant: ResourceAccessVariant;
  url: string;
  delivery: 'cdn' | 'origin' | 'platform-local' | 'platform-proxy';
  issuedAt: string;
  expiresAt?: string | null;
  refreshAt: string;
  revision: string;
  fallbackReason?: string;
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
