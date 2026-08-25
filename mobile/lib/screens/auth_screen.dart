import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets.dart';

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  bool _signingUp = false;
  bool _busy = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });

    try {
      if (_signingUp) {
        await Api.signUp(_email.text, _password.text, _name.text);
        // With email confirmation on there is no session yet. Say so plainly
        // instead of leaving a screen that looks like it failed.
        if (Api.userId == null && mounted) {
          setState(() {
            _signingUp = false;
            _notice = 'Check your email to confirm, then sign in.';
          });
        }
      } else {
        await Api.signIn(_email.text, _password.text);
      }
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Rise(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      '🕯️',
                      style: TextStyle(fontSize: 40),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    Text('Ours', style: text.displayMedium, textAlign: TextAlign.center),
                    const SizedBox(height: 10),
                    Text(
                      'A room with two keys. No profiles, no followers,\nno feed — just the two of you.',
                      style: text.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 28),

                    Surface(
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (_signingUp)
                              SheetField(
                                label: 'What should they call you?',
                                child: TextFormField(
                                  controller: _name,
                                  textCapitalization: TextCapitalization.words,
                                  decoration: const InputDecoration(hintText: 'Esther'),
                                ),
                              ),

                            SheetField(
                              label: 'Email',
                              child: TextFormField(
                                controller: _email,
                                keyboardType: TextInputType.emailAddress,
                                autocorrect: false,
                                decoration: const InputDecoration(
                                  hintText: 'you@example.com',
                                ),
                                validator: (v) =>
                                    (v == null || !v.contains('@'))
                                        ? 'Needs a real email'
                                        : null,
                              ),
                            ),

                            SheetField(
                              label: 'Password',
                              hint: _signingUp ? 'At least 6 characters.' : null,
                              child: TextFormField(
                                controller: _password,
                                obscureText: true,
                                decoration: const InputDecoration(hintText: '••••••••'),
                                validator: (v) => (v == null || v.length < 6)
                                    ? 'At least 6 characters'
                                    : null,
                              ),
                            ),

                            if (_error != null) ...[
                              _Banner(text: _error!, tone: Accent.flame),
                              const SizedBox(height: 14),
                            ],
                            if (_notice != null) ...[
                              _Banner(text: _notice!, tone: Ember.c400),
                              const SizedBox(height: 14),
                            ],

                            FilledButton(
                              onPressed: _busy ? null : _submit,
                              child: _busy
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Dusk.c900,
                                      ),
                                    )
                                  : Text(_signingUp ? 'Create my key' : 'Let me in'),
                            ),

                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: _busy
                                  ? null
                                  : () => setState(() {
                                      _signingUp = !_signingUp;
                                      _error = null;
                                      _notice = null;
                                    }),
                              child: Text(
                                _signingUp
                                    ? 'Already have a key? Sign in'
                                    : 'First time here? Make one',
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.text, required this.tone});

  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.1),
        border: Border.all(color: tone.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(text, style: TextStyle(color: tone, fontSize: 13)),
    );
  }
}
