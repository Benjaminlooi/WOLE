import { NativeModules, Platform } from 'react-native';

const { WolServerModule } = NativeModules;

export async function startWolServer({ port = 8080, token = null } = {}) {
  if (Platform.OS !== 'android') throw new Error('Android only');
  return WolServerModule.start(port, token);
}

export async function stopWolServer() {
  if (Platform.OS !== 'android') throw new Error('Android only');
  return WolServerModule.stop();
}

