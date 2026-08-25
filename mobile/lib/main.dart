import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'router.dart';
import 'session.dart';
import 'theme.dart';
import 'nudge_overlay.dart';
import 'push.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Dusk.c800,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  if (!Config.isConfigured) {
    runApp(const _MissingConfigApp());
    return;
  }

  await Supabase.initialize(
    url: Config.supabaseUrl,
    publishableKey: Config.supabaseAnonKey,
  );

  // No-ops if Firebase config files are missing, so the app still runs before
  // push is set up.
  await Push.init();

  runApp(const ProviderScope(child: OursApp()));
}

class OursApp extends ConsumerStatefulWidget {
  const OursApp({super.key});

  @override
  ConsumerState<OursApp> createState() => _OursAppState();
}

class _OursAppState extends ConsumerState<OursApp> {
  late final AppSession _session = ref.read(sessionProvider);
  late final _router = buildRouter(_session);

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Ours',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: _router,
      builder: (context, child) => CandleBackground(
        // The nudge overlay sits above every route so "I miss you" lands
        // wherever they happen to be.
        child: NudgeOverlay(child: child ?? const SizedBox.shrink()),
      ),
    );
  }
}

/// Rather than a red screen of death when the dart-defines are missing.
class _MissingConfigApp extends StatelessWidget {
  const _MissingConfigApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('🕯️', style: TextStyle(fontSize: 44)),
                const SizedBox(height: 16),
                Text(
                  'Supabase keys missing',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 10),
                Text(
                  'Run with:\n\n'
                  'flutter run \\\n'
                  '  --dart-define=SUPABASE_URL=… \\\n'
                  '  --dart-define=SUPABASE_ANON_KEY=…\n\n'
                  'or copy .env.example.json to .env.json and use\n'
                  '--dart-define-from-file=.env.json',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
