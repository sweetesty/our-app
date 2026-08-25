import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _name = TextEditingController();
  final _spaceName = TextEditingController();

  DateTime? _anniversary;
  bool _busy = false;
  bool _saved = false;
  bool _copied = false;

  @override
  void initState() {
    super.initState();
    final session = ref.read(sessionProvider);
    _name.text = session.me?.displayName ?? '';
    _spaceName.text = session.summary?.couple?.name ?? '';
    _anniversary = session.summary?.couple?.anniversary;
  }

  @override
  void dispose() {
    _name.dispose();
    _spaceName.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final session = ref.read(sessionProvider);
    final coupleId = session.coupleId;
    if (coupleId == null) return;

    setState(() => _busy = true);
    try {
      await Api.updateProfile(_name.text);
      await Api.updateCouple(
        coupleId,
        name: _spaceName.text,
        anniversary: _anniversary,
      );
      await session.refresh();

      if (!mounted) return;
      setState(() => _saved = true);
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) setState(() => _saved = false);
      });
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickAnniversary() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _anniversary ?? DateTime.now(),
      firstDate: DateTime(1990),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _anniversary = picked);
  }

  Future<void> _copyCode(String code) async {
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) return;
    setState(() => _copied = true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final text = Theme.of(context).textTheme;
    final couple = session.summary?.couple;
    final partner = session.partner;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: const Text('Your space')),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Surface(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SectionLabel('You'),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Avatar(
                        name: session.me?.displayName,
                        url: session.me?.avatarUrl,
                        size: 52,
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: TextField(
                          controller: _name,
                          maxLength: 40,
                          decoration: const InputDecoration(
                            hintText: 'Display name',
                            counterText: '',
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            Surface(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SectionLabel('The space'),
                  const SizedBox(height: 14),
                  SheetField(
                    label: 'Name',
                    hint: 'Shows in the header. “Us” works fine.',
                    child: TextField(
                      controller: _spaceName,
                      maxLength: 40,
                      decoration: const InputDecoration(
                        hintText: 'Us',
                        counterText: '',
                      ),
                    ),
                  ),
                  SheetField(
                    label: 'Together since',
                    hint: 'Powers the day count and the timeline.',
                    child: OutlinedButton(
                      onPressed: _pickAnniversary,
                      child: Text(
                        _anniversary == null
                            ? 'Pick a date'
                            : longDate(_anniversary!),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            FilledButton(
              onPressed: _busy ? null : _save,
              child: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Dusk.c900,
                      ),
                    )
                  : Text(_saved ? 'Saved ✓' : 'Save changes'),
            ),
            const SizedBox(height: 12),

            Surface(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SectionLabel("Who's here"),
                  const SizedBox(height: 14),
                  if (partner != null)
                    Row(
                      children: [
                        Avatar(name: partner.displayName, url: partner.avatarUrl),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(partner.displayName, style: text.titleMedium),
                            Text('joined — the space is full', style: text.bodySmall),
                          ],
                        ),
                      ],
                    )
                  else ...[
                    Text(
                      'Send them this code. Once they use it, the door closes — '
                      'nobody else can join.',
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 14),
                    GestureDetector(
                      onTap: couple == null ? null : () => _copyCode(couple.inviteCode),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        decoration: BoxDecoration(
                          color: Dusk.c800.withValues(alpha: 0.6),
                          border: Border.all(
                            color: Ember.c500.withValues(alpha: 0.4),
                          ),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          children: [
                            Text(
                              couple?.inviteCode ?? '······',
                              style: text.displayMedium?.copyWith(
                                color: Ember.c300,
                                letterSpacing: 9,
                                fontSize: 30,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _copied ? 'copied ✓' : 'tap to copy',
                              style: text.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),

            Surface(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SectionLabel('Privacy'),
                  const SizedBox(height: 12),
                  for (final line in const [
                    'Two accounts. No third person can join, enforced by the database.',
                    'No profiles, no followers, no feed, no discovery, no algorithm.',
                    'Every row is scoped to your space by row-level security.',
                    'Photos and voice notes sit in a private bucket behind signed URLs.',
                    'Sealed letters stay unreadable until they open — that rule lives in '
                        'Postgres, not the UI.',
                  ])
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('· ', style: text.bodyMedium),
                          Expanded(child: Text(line, style: text.bodyMedium)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            OutlinedButton(
              onPressed: () => ref.read(sessionProvider).signOut(),
              child: const Text('Sign out'),
            ),
          ],
        ),
      ),
    );
  }
}
