import { AppRegistry } from 'react-native';
import { registerAgentActions } from 'react-native-agent-actions';
import App from './src/App';
import { handlers } from './src/agentActionHandlers';
import { name as appName } from './app.json';

// Register at module scope: the OS can start the app in the background to run an action.
registerAgentActions(handlers);

AppRegistry.registerComponent(appName, () => App);
