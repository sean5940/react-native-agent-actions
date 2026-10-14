import { useSyncExternalStore } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { getCallLog, subscribeToCallLog, type CallLogEntry } from './callLog';

function format(value: unknown): string {
  return value === undefined ? 'nothing' : JSON.stringify(value);
}

function Entry({ entry }: { entry: CallLogEntry }) {
  const background = entry.appState !== 'active';
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.action}>{entry.action}</Text>
        <Text style={[styles.badge, background && styles.badgeBackground]}>
          {background ? 'app was in background' : 'app open'}
        </Text>
      </View>
      <Text style={styles.time}>{entry.at.toLocaleTimeString()}</Text>
      <Text style={styles.label}>params</Text>
      <Text style={styles.code} numberOfLines={2}>
        {format(entry.params)}
      </Text>
      <Text style={styles.label}>{entry.outcome.ok ? 'result' : 'error'}</Text>
      <Text
        style={[styles.code, !entry.outcome.ok && styles.error]}
        numberOfLines={3}
      >
        {entry.outcome.ok ? format(entry.outcome.result) : entry.outcome.error}
      </Text>
    </View>
  );
}

export default function App() {
  const entries = useSyncExternalStore(subscribeToCallLog, getCallLog);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Agent actions</Text>
      <Text style={styles.subtitle}>
        Calls from Siri, Shortcuts, Gemini or adb show up here, including the
        ones that started the app.
      </Text>
      <FlatList
        data={entries}
        keyExtractor={(entry) => String(entry.id)}
        renderItem={({ item }) => <Entry entry={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No calls yet. Run an action from the Shortcuts app or with adb.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f6f8fa',
    paddingTop: 72,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f2328',
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 14,
    color: '#59636e',
    paddingHorizontal: 20,
    marginTop: 6,
    marginBottom: 12,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d0d7de',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  action: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1f2328',
  },
  badge: {
    fontSize: 12,
    color: '#1a7f37',
    backgroundColor: '#dafbe1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeBackground: {
    color: '#9a6700',
    backgroundColor: '#fff8c5',
  },
  time: {
    fontSize: 12,
    color: '#59636e',
    marginTop: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#59636e',
    marginTop: 10,
    textTransform: 'uppercase',
  },
  code: {
    fontFamily: 'Menlo',
    fontSize: 12,
    color: '#1f2328',
    marginTop: 2,
  },
  error: {
    color: '#cf222e',
  },
  empty: {
    fontSize: 14,
    color: '#59636e',
    textAlign: 'center',
    marginTop: 40,
  },
});
