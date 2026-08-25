import 'package:go_router/go_router.dart';

import 'screens/auth_screen.dart';
import 'screens/cards_screen.dart';
import 'screens/home_shell.dart';
import 'screens/notes_screen.dart';
import 'screens/nudges_screen.dart';
import 'screens/pair_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/timeline_screen.dart';
import 'screens/today_screen.dart';
import 'screens/us_screen.dart';
import 'screens/vault_screen.dart';
import 'session.dart';

/// Three gates, in order: signed in, paired, then everything else. The redirect
/// reads AppSession synchronously, which is why it is a ChangeNotifier.
GoRouter buildRouter(AppSession session) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: session,
    redirect: (context, state) {
      if (!session.ready) return null;

      final path = state.matchedLocation;

      if (!session.signedIn) return path == '/auth' ? null : '/auth';
      if (!session.paired) return path == '/pair' ? null : '/pair';
      if (path == '/auth' || path == '/pair') return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/auth', builder: (_, _) => const AuthScreen()),
      GoRoute(path: '/pair', builder: (_, _) => const PairScreen()),

      // The five tabs live inside HomeShell's IndexedStack so switching between
      // them keeps scroll position and in-progress text.
      GoRoute(path: '/', builder: (_, _) => const HomeShell()),

      // Pushed over the shell, each with its own back button.
      GoRoute(path: '/today', builder: (_, _) => const TodayScreen()),
      GoRoute(path: '/cards', builder: (_, _) => const CardsScreen()),
      GoRoute(path: '/notes', builder: (_, _) => const NotesScreen()),
      GoRoute(path: '/timeline', builder: (_, _) => const TimelineScreen()),
      GoRoute(path: '/vault', builder: (_, _) => const VaultScreen()),
      GoRoute(path: '/nudges', builder: (_, _) => const NudgesScreen()),
      GoRoute(path: '/us', builder: (_, _) => const UsScreen()),
      GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
    ],
  );
}
