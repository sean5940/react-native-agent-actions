import { AppRegistry } from 'react-native';
import { registerAgentActions } from 'react-native-agent-actions';
import App from './src/App';
import { name as appName } from './app.json';

const loadedAt = Date.now();

registerAgentActions({
  echo: async (payload) => ({
    echoed: payload,
    jsUptimeMs: Date.now() - loadedAt,
  }),
  wait: (payload) =>
    new Promise((resolve) =>
      setTimeout(() => resolve({ waitedMs: payload.ms }), payload.ms)
    ),
  fail: () => {
    throw new Error('Handler failed on purpose');
  },
});

AppRegistry.registerComponent(appName, () => App);
