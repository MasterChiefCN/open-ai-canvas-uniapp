import { afterEach, expect, it, vi } from 'vitest';
import { chooseNativeAudio } from '../src/services/native-audio';

afterEach(() => vi.unstubAllGlobals());

function android(size = 64) {
  const original = vi.fn();
  const activity: any = { onActivityResult: original };
  const close = vi.fn();
  const remove = vi.fn();
  let remaining = size;
  const cursor = {
    moveToFirst: () => true,
    getColumnIndex: (s: string) => (s === '_size' ? 1 : 0),
    getString: () => '中文音频.mp3',
    getLong: () => size,
    close,
  };
  const output = {
    close,
    getChannel: () => ({
      transferFrom: (_channel: unknown, _offset: number, length: number) => {
        const copied = Math.min(remaining, length);
        remaining -= copied;
        return copied;
      },
    }),
  };
  const intent = { setType: vi.fn(), addCategory: vi.fn() };
  const start = vi.fn();
  activity.startActivityForResult = start;
  activity.getContentResolver = () => ({ query: () => cursor, openInputStream: () => ({ close }) });
  activity.getCacheDir = () => '/app/cache';
  vi.stubGlobal('plus', {
    os: { name: 'Android' },
    io: {
      resolveLocalFileSystemURL: (_path: string, success: (entry: unknown) => void) =>
        success({ remove }),
    },
    android: {
      runtimeMainActivity: () => activity,
      newObject: (name: string) =>
        name === 'java.io.FileOutputStream'
          ? output
          : name === 'java.io.File'
            ? { getAbsolutePath: () => '/app/cache/canvas-audio.mp3' }
            : intent,
      invoke: (object: any, method: string, ...args: unknown[]) =>
        object === 'java.nio.channels.Channels' ? { close } : object[method](...args),
    },
  });
  return { activity, original, close, remove, intent, start };
}

it('copies an Android document into cache, restores the callback and cleans only the copy', async () => {
  const mock = android();
  const promise = chooseNativeAudio(100);
  expect(mock.intent.setType).toHaveBeenCalledWith('audio/*');
  mock.activity.onActivityResult(123, 0, null);
  expect(mock.original).toHaveBeenCalledWith(123, 0, null);
  mock.activity.onActivityResult(48317, -1, { getData: () => 'content://audio/1' });
  const [file] = await promise;
  expect(file).toMatchObject({
    path: '/app/cache/canvas-audio.mp3',
    name: '中文音频.mp3',
    size: 64,
  });
  expect(mock.activity.onActivityResult).toBe(mock.original);
  expect(mock.close).toHaveBeenCalledTimes(4);
  file.cleanup?.();
  expect(mock.remove).toHaveBeenCalledOnce();
});

it('rejects overlapping pickers and treats cancellation as cancellation', async () => {
  const mock = android();
  const promise = chooseNativeAudio(100);
  await expect(chooseNativeAudio(100)).rejects.toThrow('已打开');
  mock.activity.onActivityResult(48317, 0, null);
  await expect(promise).rejects.toMatchObject({ errMsg: 'chooseAudio:fail cancel' });
  expect(mock.activity.onActivityResult).toBe(mock.original);
});

it('rejects oversized Android documents before copying', async () => {
  const mock = android(101);
  const promise = chooseNativeAudio(100);
  mock.activity.onActivityResult(48317, -1, { getData: () => 'content://audio/1' });
  await expect(promise).rejects.toThrow('超过');
  expect(mock.activity.onActivityResult).toBe(mock.original);
});

function ios() {
  let delegate: any;
  const remove = vi.fn();
  const controller = {
    presentedViewController: () => null,
    'presentViewController:animated:completion:': vi.fn(),
  };
  const picker = {
    'initWithDocumentTypes:inMode:': vi.fn(() => picker),
    'setAllowsMultipleSelection:': vi.fn(),
    'setModalPresentationStyle:': vi.fn(),
    'setDelegate:': vi.fn(),
  };
  vi.stubGlobal('plus', {
    os: { name: 'iOS' },
    io: {
      resolveLocalFileSystemURL: (_path: string, callback: (entry: unknown) => void) =>
        callback({
          remove,
          getMetadata: (done: (meta: unknown) => void) => done({ size: 64 }),
        }),
    },
    ios: {
      invoke: (object: any, method: string, ...args: unknown[]) =>
        object === 'UIDocumentPickerViewController' ? picker : object[method](...args),
      implements: (_name: string, callbacks: any) => {
        delegate = callbacks;
        return callbacks;
      },
      currentWebview: () => ({ window: () => ({ rootViewController: () => controller }) }),
    },
  });
  return { picker, remove, callback: () => delegate };
}

it('uses iOS import mode and releases the delegate after selecting a Chinese filename', async () => {
  const mock = ios();
  const promise = chooseNativeAudio(100);
  expect(mock.picker['initWithDocumentTypes:inMode:']).toHaveBeenCalledWith(['public.audio'], 0);
  mock
    .callback()
    [
      'documentPicker:didPickDocumentsAtURLs:'
    ](null, { 'objectAtIndex:': () => ({ path: () => '/app/tmp/中文.m4a', lastPathComponent: () => '中文.m4a' }) });
  const [file] = await promise;
  expect(file).toMatchObject({ name: '中文.m4a', size: 64 });
  expect(mock.picker['setDelegate:']).toHaveBeenLastCalledWith(null);
  file.cleanup?.();
  expect(mock.remove).toHaveBeenCalledOnce();
});

it('releases the iOS delegate on cancellation', async () => {
  const mock = ios();
  const promise = chooseNativeAudio(100);
  mock.callback()['documentPickerWasCancelled:']();
  await expect(promise).rejects.toMatchObject({ errMsg: 'chooseAudio:fail cancel' });
  expect(mock.picker['setDelegate:']).toHaveBeenLastCalledWith(null);
});
