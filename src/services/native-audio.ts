import type { SelectedReference } from './reference-upload';

const audioExtension = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const cancelled = () => ({ errMsg: 'chooseAudio:fail cancel' });
let picking = false;
// iOS 的 delegate 为弱引用，必须保留到用户完成或取消选择。
let iosDelegate: unknown;

export async function chooseNativeAudio(maxBytes: number): Promise<SelectedReference[]> {
  if (picking) throw new Error('音频选择器已打开');
  picking = true;
  try {
    if (plus.os.name === 'Android') return [await androidAudio(maxBytes)];
    if (plus.os.name === 'iOS') return [await iosAudio(maxBytes)];
    throw new Error('当前系统不支持音频文件选择');
  } finally {
    picking = false;
  }
}

function removeTemporary(path: string) {
  // 仅接收下面创建或由 iOS import 模式复制到沙箱的临时文件。
  plus.io.resolveLocalFileSystemURL(
    path,
    (entry) => entry.remove(),
    () => {},
  );
}

function androidAudio(maxBytes: number): Promise<SelectedReference> {
  // Native.js 对象由系统动态提供方法；可变参数签名比旧版声明文件更完整。
  const invoke = plus.android.invoke as (object: any, method: string, ...args: any[]) => any;
  const create = plus.android.newObject as (name: string, ...args: any[]) => any;
  const activity = plus.android.runtimeMainActivity() as PlusAndroidInstanceObject & {
    onActivityResult?: (code: number, result: number, data: any) => void;
  };
  const requestCode = 48317;
  return new Promise((resolve, reject) => {
    const previous = activity.onActivityResult;
    const handler = (code: number, result: number, data: any) => {
      if (code !== requestCode) {
        previous?.call(activity, code, result, data);
        return;
      }
      if (activity.onActivityResult === handler) activity.onActivityResult = previous;
      if (result !== -1 || !data) {
        reject(cancelled());
        return;
      }
      let input: any;
      let output: any;
      let channel: any;
      let cursor: any;
      let path = '';
      try {
        const uri = invoke(data, 'getData');
        const resolver = invoke(activity, 'getContentResolver');
        cursor = invoke(resolver, 'query', uri, null, null, null, null);
        if (!cursor || !invoke(cursor, 'moveToFirst')) throw new Error('无法读取音频文件信息');
        const column = invoke(cursor, 'getColumnIndex', '_display_name');
        const name = column >= 0 ? String(invoke(cursor, 'getString', column)) : '';
        if (!audioExtension.test(name))
          throw new Error('请选择 mp3、wav、m4a、aac、ogg 或 flac 音频');
        const sizeColumn = invoke(cursor, 'getColumnIndex', '_size');
        if (sizeColumn >= 0 && Number(invoke(cursor, 'getLong', sizeColumn)) > maxBytes)
          throw new Error('音频文件超过上传大小限制');
        const cache = invoke(activity, 'getCacheDir');
        const file = create(
          'java.io.File',
          cache,
          `canvas-audio-${Date.now()}-${Math.random().toString(16).slice(2)}${name.slice(name.lastIndexOf('.'))}`,
        );
        path = String(invoke(file, 'getAbsolutePath'));
        input = invoke(resolver, 'openInputStream', uri);
        channel = invoke('java.nio.channels.Channels', 'newChannel', input);
        output = create('java.io.FileOutputStream', file);
        const destination = invoke(output, 'getChannel');
        let size = 0;
        while (size <= maxBytes) {
          const copied = Number(
            invoke(
              destination,
              'transferFrom',
              channel,
              size,
              Math.min(1024 * 1024, maxBytes + 1 - size),
            ),
          );
          if (!copied) break;
          size += copied;
        }
        if (!size || size > maxBytes) throw new Error('音频为空或超过上传大小限制');
        resolve({ path, name, size, cleanup: () => removeTemporary(path) });
      } catch (error) {
        if (path) removeTemporary(path);
        reject(error instanceof Error ? error : new Error('读取音频失败，请先将文件下载到本机'));
      } finally {
        for (const object of [cursor, channel, input, output]) {
          if (object) {
            try {
              invoke(object, 'close');
            } catch {
              /* 已关闭的流无需再处理。 */
            }
          }
        }
      }
    };
    activity.onActivityResult = handler;
    try {
      const intent = create('android.content.Intent', 'android.intent.action.OPEN_DOCUMENT');
      invoke(intent, 'setType', 'audio/*');
      invoke(intent, 'addCategory', 'android.intent.category.OPENABLE');
      invoke(activity, 'startActivityForResult', intent, requestCode);
    } catch {
      if (activity.onActivityResult === handler) activity.onActivityResult = previous;
      reject(new Error('无法打开系统文件选择器'));
    }
  });
}

function iosAudio(maxBytes: number): Promise<SelectedReference> {
  const invoke = plus.ios.invoke as (object: any, method: string, ...args: any[]) => any;
  return new Promise((resolve, reject) => {
    let picker: any;
    let finished = false;
    const release = () => {
      if (picker) invoke(picker, 'setDelegate:', null);
      iosDelegate = undefined;
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      release();
      reject(cancelled());
    };
    const selected = (url: any) => {
      if (finished) return;
      finished = true;
      let path = '';
      try {
        path = String(invoke(url, 'path'));
        const name = String(invoke(url, 'lastPathComponent'));
        release();
        if (!audioExtension.test(name)) {
          removeTemporary(path);
          reject(new Error('请选择 mp3、wav、m4a、aac、ogg 或 flac 音频'));
          return;
        }
        plus.io.resolveLocalFileSystemURL(
          path,
          (entry) => {
            entry.getMetadata(
              (meta) => {
                const size = meta.size || 0;
                if (!size || size > maxBytes) {
                  removeTemporary(path);
                  reject(new Error('音频为空或超过上传大小限制'));
                  return;
                }
                resolve({ path, name, size, cleanup: () => removeTemporary(path) });
              },
              () => {
                removeTemporary(path);
                reject(new Error('无法读取音频大小'));
              },
            );
          },
          () => {
            removeTemporary(path);
            reject(new Error('无法读取音频，请先将文件下载到本机'));
          },
        );
      } catch {
        release();
        if (path) removeTemporary(path);
        reject(new Error('读取音频失败'));
      }
    };
    try {
      // Import 模式(0)由系统复制到 App 沙箱，避免长期持有外部文件访问权限。
      picker = invoke('UIDocumentPickerViewController', 'alloc');
      picker = invoke(picker, 'initWithDocumentTypes:inMode:', ['public.audio'], 0);
      invoke(picker, 'setAllowsMultipleSelection:', false);
      invoke(picker, 'setModalPresentationStyle:', 0);
      iosDelegate = plus.ios.implements('UIDocumentPickerDelegate', {
        'documentPicker:didPickDocumentsAtURLs:': (_controller: any, urls: any) =>
          selected(invoke(urls, 'objectAtIndex:', 0)),
        'documentPicker:didPickDocumentAtURL:': (_controller: any, url: any) => selected(url),
        'documentPickerWasCancelled:': cancel,
      });
      invoke(picker, 'setDelegate:', iosDelegate);
      let controller = invoke(plus.ios.currentWebview(), 'window');
      controller = invoke(controller, 'rootViewController');
      let presented = invoke(controller, 'presentedViewController');
      while (presented) {
        controller = presented;
        presented = invoke(controller, 'presentedViewController');
      }
      invoke(controller, 'presentViewController:animated:completion:', picker, true, null);
    } catch {
      release();
      reject(new Error('无法打开系统文件选择器'));
    }
  });
}
