import { resourceApi } from '../api/resources';
import { albumPermissionMessage } from '../core/runtime';
import { resourceUrl, resourceIdFromUrl } from '../core/urls';
import { assertEpoch, requestEpoch } from '../core/http';
import type { MediaResult } from '../adapters/open-ai-canvas/task-result';
import type { ResourceAccessPurpose, ResourceAccessVariant } from '../types/backend';
export async function mediaAccess(
  media: MediaResult,
  purpose: ResourceAccessPurpose = 'display',
  variant?: ResourceAccessVariant,
): Promise<{ url: string; refreshAt?: string }> {
  const id = media.storageKey?.startsWith('resource:')
    ? media.storageKey.slice(9)
    : resourceIdFromUrl(media.url || '');
  if (id) {
    const access = await resourceApi.url(
      id,
      purpose,
      variant || (purpose === 'display' && media.kind === 'video' ? 'playback' : 'original'),
    );
    return { url: resourceUrl(access.url), refreshAt: access.refreshAt };
  }
  if (media.url) return { url: resourceUrl(media.url) };
  throw new Error('结果尚无可用媒体资源');
}
export async function mediaUrl(
  media: MediaResult,
  purpose: ResourceAccessPurpose = 'display',
  variant?: ResourceAccessVariant,
) {
  return (await mediaAccess(media, purpose, variant)).url;
}
export async function saveMedia(media: MediaResult) {
  const epoch = requestEpoch();
  const url = await mediaUrl(media, 'download', 'original');
  assertEpoch(epoch);
  const path = await new Promise<string>((resolve, reject) =>
    uni.downloadFile({
      url,
      success: (result) =>
        result.statusCode === 200
          ? resolve(result.tempFilePath)
          : reject(new Error('媒体下载失败，请刷新后重试')),
      fail: () => reject(new Error('下载失败，请检查下载域名及网络')),
    }),
  );
  assertEpoch(epoch);
  await new Promise<void>((resolve, reject) => {
    const options = {
      filePath: path,
      success: () => resolve(),
      fail: (error: { errMsg: string }) =>
        reject(
          new Error(
            /auth|deny|permission/i.test(error.errMsg)
              ? albumPermissionMessage()
              : '保存失败，请检查设备空间或媒体格式',
          ),
        ),
    };
    if (media.kind === 'video') uni.saveVideoToPhotosAlbum(options);
    else uni.saveImageToPhotosAlbum(options);
  });
}
