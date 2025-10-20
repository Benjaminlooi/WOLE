import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Button,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  PermissionsAndroid,
} from 'react-native';
import BackgroundService from 'react-native-background-actions';
import TcpSocket from 'react-native-tcp-socket';
import dgram from 'react-native-udp';
import { NetworkInfo } from 'react-native-network-info';
import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

const statusSubscribers = new Set();
const serverState = {
  server: null,
  sockets: new Set(),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const httpStatusTexts = {
  200: 'OK',
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  500: 'Internal Server Error',
};

const logStatus = (message) => {
  const timestamped = `[${new Date().toISOString()}] ${message}`;
  console.log(timestamped);
  statusSubscribers.forEach((handler) => handler(timestamped));
  BackgroundService.updateNotification({
    taskDesc: message,
  }).catch(() => {
    // No-op: notifications can fail when service is not running
  });
};

const subscribeToStatus = (handler) => {
  statusSubscribers.add(handler);
  return () => {
    statusSubscribers.delete(handler);
  };
};

const closeAllSockets = () => {
  serverState.sockets.forEach((socket) => {
    try {
      socket.destroy();
    } catch (error) {
      console.warn('Failed to destroy socket', error);
    }
  });
  serverState.sockets.clear();
};

const shutdownServer = () => {
  if (serverState.server) {
    try {
      serverState.server.close();
    } catch (error) {
      console.warn('Failed to close server', error);
    }
    serverState.server = null;
  }
  closeAllSockets();
};

const parseHttpRequest = (buffer) => {
  const requestString = buffer.toString('utf8');
  const separatorIndex = requestString.indexOf('\r\n\r\n');
  if (separatorIndex === -1) {
    return null;
  }

  const headerSection = requestString.substring(0, separatorIndex);
  const [requestLine, ...headerLines] = headerSection.split('\r\n');
  if (!requestLine) {
    return null;
  }

  const [method, path] = requestLine.split(' ');
  const headers = {};
  headerLines.forEach((line) => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      headers[key.trim().toLowerCase()] = rest.join(':').trim();
    }
  });

  const contentLength = parseInt(headers['content-length'] || '0', 10);
  const bodyStartIndex = separatorIndex + 4;
  const totalLength = bodyStartIndex + contentLength;

  if (requestString.length < totalLength) {
    return null;
  }

  const body = requestString.substring(bodyStartIndex, totalLength);

  return {
    method,
    path,
    headers,
    body,
  };
};

const sendHttpResponse = (socket, statusCode, payload) => {
  const body = JSON.stringify(payload);
  const responseLines = [
    `HTTP/1.1 ${statusCode} ${httpStatusTexts[statusCode] || ''}`.trim(),
    'Content-Type: application/json',
    `Content-Length: ${Buffer.byteLength(body)}`,
    'Connection: close',
    '',
    body,
  ];
  socket.write(responseLines.join('\r\n'), () => socket.destroy());
};

const normalizeMac = (mac) => mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();

const macToBytes = (mac) => {
  const normalized = normalizeMac(mac);
  if (normalized.length !== 12) {
    throw new Error('MAC address must be 6 bytes');
  }
  const bytes = [];
  for (let i = 0; i < 12; i += 2) {
    bytes.push(parseInt(normalized.substr(i, 2), 16));
  }
  return bytes;
};

const buildMagicPacket = (mac) => {
  const macBytes = macToBytes(mac);
  const payload = Buffer.alloc(6 + 16 * macBytes.length, 0xff);
  for (let i = 0; i < 16; i += 1) {
    for (let j = 0; j < macBytes.length; j += 1) {
      payload[6 + i * macBytes.length + j] = macBytes[j];
    }
  }
  return payload;
};

const ipToInt = (ip) =>
  ip
    .split('.')
    .map((segment) => parseInt(segment, 10))
    .reduce((acc, value) => (acc << 8) + value, 0);

const intToIp = (value) =>
  [24, 16, 8, 0].map((shift) => (value >> shift) & 255).join('.');

const resolveBroadcastAddress = async (requestedBroadcast) => {
  if (requestedBroadcast) {
    return requestedBroadcast;
  }

  const [localIp, subnet] = await Promise.all([
    NetworkInfo.getIPV4Address(),
    NetworkInfo.getSubnetMask(),
  ]);

  if (!localIp || !subnet) {
    throw new Error('Unable to determine local IP/subnet');
  }

  const broadcastInt = ipToInt(localIp) | (~ipToInt(subnet) >>> 0);
  return intToIp(broadcastInt);
};

const sendMagicPacket = async (mac, broadcast, port) =>
  new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const packet = buildMagicPacket(mac);
    socket.once('error', (error) => {
      socket.close();
      reject(error);
    });
    socket.bind(0, () => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, port, broadcast, (error) => {
        socket.close();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });

const handleWakeRequest = async (body, sharedSecret) => {
  let payload;
  try {
    payload = JSON.parse(body || '{}');
  } catch (error) {
    throw new Error('Invalid JSON body');
  }

  if (!payload.mac) {
    throw new Error('Request must include a target mac');
  }

  if (sharedSecret && payload.token !== sharedSecret) {
    const authError = new Error('Unauthorized');
    authError.statusCode = 401;
    throw authError;
  }

  const broadcast = await resolveBroadcastAddress(payload.broadcast);
  const udpPort = payload.port ? Number(payload.port) : 9;

  if (Number.isNaN(udpPort) || udpPort <= 0 || udpPort > 65535) {
    throw new Error('Invalid UDP port');
  }

  await sendMagicPacket(payload.mac, broadcast, udpPort);
  return { mac: normalizeMac(payload.mac), broadcast, port: udpPort };
};

const backgroundTask = async ({ port, token }) => {
  logStatus(`Starting WOL relay on port ${port}`);
  const server = TcpSocket.createServer((socket) => {
    serverState.sockets.add(socket);

    let buffer = Buffer.alloc(0);

    socket.on('data', async (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      const parsedRequest = parseHttpRequest(buffer);
      if (!parsedRequest) {
        return;
      }

      const { method, path, body } = parsedRequest;

      if (method !== 'POST' || path !== '/wake') {
        sendHttpResponse(socket, 404, { error: 'Not Found' });
        return;
      }

      try {
        const result = await handleWakeRequest(body, token);
        logStatus(
          `Magic packet sent to ${result.mac} via ${result.broadcast}:${result.port}`,
        );
        sendHttpResponse(socket, 200, {
          ok: true,
          ...result,
        });
      } catch (error) {
        const statusCode = error.statusCode || (error.message === 'Unauthorized' ? 401 : 400);
        const message = statusCode === 401 ? 'Unauthorized' : error.message || 'Bad Request';
        logStatus(`Failed to handle wake request: ${message}`);
        sendHttpResponse(socket, statusCode, { ok: false, error: message });
      } finally {
        buffer = Buffer.alloc(0);
      }
    });

    socket.on('error', (error) => {
      logStatus(`Socket error: ${error.message}`);
      socket.destroy();
    });

    socket.on('close', () => {
      serverState.sockets.delete(socket);
    });
  });

  server.on('error', (error) => {
    logStatus(`Server error: ${error.message}`);
  });

  server.listen({ port, host: '0.0.0.0' }, () => {
    logStatus(`HTTP server listening on 0.0.0.0:${port}`);
  });

  serverState.server = server;

  await new Promise(async (resolve) => {
    while (BackgroundService.isRunning()) {
      await sleep(1000);
    }
    resolve();
  });

  shutdownServer();
  logStatus('WOL relay stopped');
};

const taskOptions = {
  taskName: 'wolRelay',
  taskTitle: 'WOL Relay',
  taskDesc: 'Ready',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#0a84ff',
  parameters: {},
};

export default function App() {
  const [listenPort, setListenPort] = useState('8080');
  const [sharedSecret, setSharedSecret] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [statusLog, setStatusLog] = useState([]);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    return subscribeToStatus((entry) => {
      setStatusLog((current) => {
        const next = [entry, ...current];
        return next.slice(0, 200);
      });
    });
  }, []);

  useEffect(() => {
    setIsRunning(BackgroundService.isRunning());
  }, []);

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
  }, [statusLog]);

  const ensureForegroundServiceReady = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return true;
    }

    // Android 13+ requires runtime POST_NOTIFICATIONS for foreground services
    const sdkInt = Number(Platform.Version);
    if (!Number.isNaN(sdkInt) && sdkInt >= 33) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Notifications required',
            'Grant notification permission to run the foreground service.',
          );
          return false;
        }
      } catch (e) {
        // If the request throws, be safe and block start
        Alert.alert(
          'Permission error',
          'Could not request notification permission.',
        );
        return false;
      }
    }

    return true;
  }, []);

  const startRelay = useCallback(async () => {
    const portNumber = Number(listenPort);
    if (Number.isNaN(portNumber) || portNumber <= 0 || portNumber > 65535) {
      Alert.alert('Invalid port', 'Please enter a TCP port between 1 and 65535.');
      return;
    }

    if (!sharedSecret) {
      Alert.alert(
        'Missing shared secret',
        'Set a shared secret token to prevent unauthorized requests.',
      );
      return;
    }

    if (BackgroundService.isRunning()) {
      Alert.alert('Already running', 'The WOL relay is already running.');
      return;
    }

    const ok = await ensureForegroundServiceReady();
    if (!ok) {
      return;
    }

    taskOptions.parameters = { port: portNumber, token: sharedSecret };
    try {
      await BackgroundService.start(backgroundTask, taskOptions);
      logStatus(`Foreground service started on port ${portNumber}`);
      setIsRunning(true);
    } catch (error) {
      Alert.alert('Failed to start relay', error.message);
    }
  }, [listenPort, sharedSecret, ensureForegroundServiceReady]);

  const stopRelay = useCallback(async () => {
    if (!BackgroundService.isRunning()) {
      return;
    }

    try {
      await BackgroundService.stop();
      shutdownServer();
      setIsRunning(false);
    } catch (error) {
      Alert.alert('Failed to stop relay', error.message);
    }
  }, []);

  const statusLabel = useMemo(() => (isRunning ? 'Running' : 'Stopped'), [isRunning]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Android WOL Relay</Text>
        <Text style={styles.subtitle}>Status: {statusLabel}</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Listen Port</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={listenPort}
          onChangeText={setListenPort}
          placeholder="8080"
        />

        <Text style={styles.label}>Shared Secret Token</Text>
        <TextInput
          style={styles.input}
          value={sharedSecret}
          placeholder="Enter shared secret"
          onChangeText={setSharedSecret}
          secureTextEntry
        />

        <View style={styles.buttonRow}>
          <View style={styles.buttonWrapper}>
            <Button title="Start Relay" onPress={startRelay} disabled={isRunning} />
          </View>
          <View style={styles.buttonWrapper}>
            <Button title="Stop Relay" onPress={stopRelay} disabled={!isRunning} />
          </View>
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Battery Optimization Settings"
            color="#facc15"
            onPress={() => {
              if (Platform.OS === 'android') {
                Linking.openSettings().catch(() => {
                  Alert.alert(
                    'Settings unavailable',
                    'Open system settings manually to disable battery optimizations for this app.',
                  );
                });
              } else {
                Alert.alert('Android only', 'Battery optimization settings are only available on Android.');
              }
            }}
          />
        </View>
      </View>

      <Text style={styles.logHeader}>Event Log</Text>
      <ScrollView style={styles.logContainer} ref={scrollViewRef}>
        {statusLog.map((entry) => (
          <Text style={styles.logEntry} key={entry}>
            {entry}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1120',
    paddingHorizontal: 16,
  },
  header: {
    paddingVertical: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  subtitle: {
    marginTop: 4,
    color: '#cbd5f5',
  },
  form: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    color: '#e2e8f0',
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  buttonWrapper: {
    flex: 1,
    marginHorizontal: 4,
  },
  logHeader: {
    color: '#94a3b8',
    marginBottom: 8,
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
  },
  logEntry: {
    color: '#cbd5f5',
    marginBottom: 6,
    fontFamily: 'Courier',
    fontSize: 12,
  },
});
