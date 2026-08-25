import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'api.dart';
import 'models.dart';
import 'push.dart';

/// Holds who is signed in and which space they are in. A plain ChangeNotifier
/// rather than an async provider because go_router's redirect needs to read the
/// answer synchronously on every navigation.
class AppSession extends ChangeNotifier {
  AppSession() {
    _start();
  }

  Session? _auth;
  HomeSummary? _summary;
  bool _ready = false;
  StreamSubscription<AuthState>? _sub;

  Session? get auth => _auth;
  HomeSummary? get summary => _summary;
  bool get ready => _ready;
  bool get signedIn => _auth != null;
  bool get paired => _summary?.paired ?? false;

  String? get userId => _auth?.user.id;
  String? get coupleId => _summary?.couple?.id;
  Profile? get me => _summary?.me;
  Profile? get partner => _summary?.partner;
  String get partnerName => _summary?.partner?.displayName ?? 'them';

  void _start() {
    _auth = Supabase.instance.client.auth.currentSession;

    _sub = Supabase.instance.client.auth.onAuthStateChange.listen((state) async {
      _auth = state.session;
      if (_auth == null) {
        _summary = null;
        notifyListeners();
      } else {
        await refresh();
      }
    });

    unawaited(_bootstrap());
  }

  Future<void> _bootstrap() async {
    if (_auth != null) {
      await refresh(notify: false);
    }
    _ready = true;
    notifyListeners();
  }

  Future<void> refresh({bool notify = true}) async {
    if (_auth == null) return;
    try {
      _summary = await Api.homeSummary();
    } catch (_) {
      _summary = HomeSummary(paired: false);
    }

    // Registering here rather than at startup means the token is always tied
    // to whoever is actually signed in.
    unawaited(Push.registerForUser());

    if (notify) notifyListeners();
  }

  Future<void> signOut() async {
    // Drop the device token first: after signOut the RPC would have no auth
    // context and the row would be left behind, sending this person's nudges
    // to whoever signs in next on this phone.
    await Push.unregister();
    await Api.signOut();
    _summary = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

final sessionProvider = Provider<AppSession>((ref) {
  final session = AppSession();
  ref.onDispose(session.dispose);
  return session;
});
