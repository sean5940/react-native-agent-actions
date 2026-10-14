/** A value an action accepts as a parameter. */
export type AgentActionParam =
  | {
      type: 'string' | 'number' | 'integer' | 'boolean';
      /** Shown to the agent. Explain what the value means and its format. */
      description: string;
      /** Short label for Shortcuts and Siri. Defaults to the parameter name. */
      title?: string;
      /** When true the agent may leave the parameter out. */
      optional?: boolean;
    }
  | {
      type: 'array';
      items: { type: 'string' };
      description: string;
      title?: string;
      optional?: boolean;
    };

/** A value an action returns. Objects become typed classes on Android and JSON on iOS. */
export type AgentActionValue =
  | {
      type: 'string' | 'number' | 'integer' | 'boolean';
      description?: string;
      /** When true the value may be `null`. Only allowed for object properties. */
      optional?: boolean;
    }
  | {
      type: 'array';
      items: AgentActionValue;
      description?: string;
      optional?: boolean;
    }
  | {
      type: 'object';
      /** Type name used in the generated Kotlin and TypeScript code, for example `Note`. */
      name: string;
      properties: Record<string, AgentActionValue>;
      description?: string;
      optional?: boolean;
    };

export interface AgentAction {
  /** Short, user-facing name. Used as the App Intent title. */
  title: string;
  /** Tells the agent what the action does and when to call it. */
  description: string;
  params?: Record<string, AgentActionParam>;
  /** Leave it out when the action returns nothing useful. */
  result?: AgentActionValue;
  /** How long the native side waits for the JavaScript handler. Defaults to 10000. */
  timeoutMs?: number;
  /** Platforms that expose the action. Defaults to both. */
  platforms?: Array<'android' | 'ios'>;
  ios?: {
    /**
     * App Shortcut phrases for Siri and Spotlight. Each phrase must contain `${applicationName}`,
     * for example `'Search notes in ${applicationName}'`.
     */
    phrases?: string[];
    /** SF Symbol shown next to the App Shortcut. */
    systemImageName?: string;
  };
}

export interface AgentActionsConfig {
  actions: Record<string, AgentAction>;
  android?: {
    /** Where the Kotlin file is written. Defaults to `android/app/src/main/java`. */
    sourceDir?: string;
    /** Defaults to `android/app/src/main/AndroidManifest.xml`. */
    manifestPath?: string;
  };
  ios?: {
    /** Folder of the app target's sources. Defaults to the only `ios/*.xcodeproj` app folder. */
    sourceDir?: string;
    /** Defaults to the only `ios/*.xcodeproj`. */
    xcodeproj?: string;
    /** Defaults to the project name. */
    target?: string;
    /** Defaults to `ios/Podfile`. */
    podfile?: string;
  };
  typescript?: {
    /** Defaults to `src/agentActions.generated.ts`. */
    outputFile?: string;
  };
}
