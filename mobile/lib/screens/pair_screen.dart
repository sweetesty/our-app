import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// The only moment the app touches anyone else. One of you opens the space and
/// gets a six-character code; the other types it in. After that the door closes
/// — join_couple() refuses a third person at the database level.
class PairScreen extends ConsumerStatefulWidget {
  const PairScreen({super.key});

  @override
  ConsumerState<PairScreen> createState() => _PairScreenState();
}

enum _Step { choose, created, joining }

class _PairScreenState extends ConsumerState<PairScreen> {
  final _spaceName = TextEditingController();
  final _code = TextEditingController();

  _Step _step = _Step.choose;
  Couple? _couple;
  bool _busy = false;
  String? _error;
  bool _copied = false;

  @override
  void dispose() {
    _spaceName.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final name = _spaceName.text.trim();
      final couple = await Api.createCouple(name.isEmpty ? null : name);
      await ref.read(sessionProvider).refresh();
      if (mounted) {
        setState(() {
          _couple = couple;
          _step = _Step.created;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _join() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await Api.joinCouple(_code.text);
      await ref.read(sessionProvider).refresh();
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _copy() async {
    if (_couple == null) return;
    await Clipboard.setData(ClipboardData(text: _couple!.inviteCode));
    if (!mounted) return;
    setState(() => _copied = true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Rise(child: _body(context)),
            ),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return switch (_step) {
      _Step.created => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PaperCard(
            glow: true,
            child: Column(
              children: [
                const Text('🔑', style: TextStyle(fontSize: 38)),
                const SizedBox(height: 14),
                Text('Your space is open', style: text.headlineSmall),
                const SizedBox(height: 8),
                Text(
                  'Send this code to them. It only works once, and only for one person.',
                  style: text.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                GestureDetector(
                  onTap: _copy,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 22),
                    decoration: BoxDecoration(
                      color: Dusk.c800.withValues(alpha: 0.6),
                      border: Border.all(color: Ember.c500.withValues(alpha: 0.4)),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(
                      children: [
                        Text(
                          _couple!.inviteCode,
                          style: text.displayMedium?.copyWith(
                            color: Ember.c300,
                            letterSpacing: 10,
                            fontSize: 38,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _copied ? 'copied ✓' : 'tap to copy',
                          style: text.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  'Waiting for them to join. You can look around meanwhile — '
                  'everything you write is already private to this space.',
                  style: text.bodySmall,
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          OutlinedButton(
            onPressed: () => ref.read(sessionProvider).refresh(),
            child: const Text("I've sent it, take me in"),
          ),
          _signOut(),
        ],
      ),

      _Step.joining => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Surface(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('💌', style: TextStyle(fontSize: 38), textAlign: TextAlign.center),
                const SizedBox(height: 12),
                Text('Got a code?', style: text.headlineSmall, textAlign: TextAlign.center),
                const SizedBox(height: 6),
                Text(
                  'The six characters they sent you.',
                  style: text.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _code,
                  textAlign: TextAlign.center,
                  maxLength: 6,
                  autocorrect: false,
                  textCapitalization: TextCapitalization.characters,
                  inputFormatters: [UpperCaseFormatter()],
                  style: text.displayMedium?.copyWith(
                    color: Glow.c100,
                    letterSpacing: 10,
                    fontSize: 30,
                  ),
                  decoration: const InputDecoration(counterText: '', hintText: 'ABC123'),
                  onChanged: (_) => setState(() {}),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Accent.flame, fontSize: 13)),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: (_busy || _code.text.trim().length < 6) ? null : _join,
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Dusk.c900),
                        )
                      : const Text('Open the door'),
                ),
                TextButton(
                  onPressed: () => setState(() {
                    _step = _Step.choose;
                    _error = null;
                  }),
                  child: const Text('Back'),
                ),
              ],
            ),
          ),
          _signOut(),
        ],
      ),

      _Step.choose => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('🚪', style: TextStyle(fontSize: 38), textAlign: TextAlign.center),
          const SizedBox(height: 12),
          Text('One space, two people', style: text.headlineSmall, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(
            'One of you opens it, the other joins with a code.\nWhoever gets there first.',
            style: text.bodyMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),

          Surface(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SheetField(
                  label: 'Name your space',
                  hint: 'Optional. You can change it later.',
                  child: TextField(
                    controller: _spaceName,
                    maxLength: 40,
                    decoration: const InputDecoration(hintText: 'Us', counterText: ''),
                  ),
                ),
                if (_error != null) ...[
                  Text(_error!, style: TextStyle(color: Accent.flame, fontSize: 13)),
                  const SizedBox(height: 12),
                ],
                FilledButton(
                  onPressed: _busy ? null : _create,
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Dusk.c900),
                        )
                      : const Text('Open a new space'),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),
          Row(
            children: [
              const Expanded(child: Divider()),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Text('or', style: text.bodySmall),
              ),
              const Expanded(child: Divider()),
            ],
          ),
          const SizedBox(height: 20),

          OutlinedButton(
            onPressed: () => setState(() => _step = _Step.joining),
            child: const Text('I have a code'),
          ),
          _signOut(),
        ],
      ),
    };
  }

  Widget _signOut() => Padding(
    padding: const EdgeInsets.only(top: 20),
    child: TextButton(
      onPressed: () => ref.read(sessionProvider).signOut(),
      child: Text('Sign out', style: TextStyle(color: Glow.c600, fontSize: 12)),
    ),
  );
}

class UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    return newValue.copyWith(text: newValue.text.toUpperCase());
  }
}
