import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../api.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

class TodayScreen extends ConsumerStatefulWidget {
  const TodayScreen({super.key});

  @override
  ConsumerState<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends ConsumerState<TodayScreen> {
  final _draft = TextEditingController();

  TodayQuestion? _question;
  List<DailyAnswer> _answers = [];
  bool _loading = true;
  bool _saving = false;
  bool _editing = false;
  String? _error;
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _load().then((_) => _subscribe());
  }

  @override
  void dispose() {
    _draft.dispose();
    final channel = _channel;
    if (channel != null) unawaited(Api.disposeChannel(channel));
    super.dispose();
  }

  void _subscribe() {
    final coupleId = ref.read(sessionProvider).coupleId;
    if (coupleId == null) return;
    // When they answer, the row arrives over the socket and the seal breaks live.
    _channel = Api.answersChannel(coupleId, () {
      if (mounted) _load();
    });
  }

  Future<void> _load() async {
    try {
      final question = await Api.todayQuestion();
      List<DailyAnswer> answers = [];
      if (question != null) answers = await Api.answersFor(question.id);

      if (!mounted) return;
      setState(() {
        _question = question;
        _answers = answers;
        _error = null;
        if (!_editing) _draft.text = question?.myAnswer ?? '';
      });
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (_draft.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      await Api.answerToday(_draft.text);
      await Api.syncAchievements();
      if (mounted) setState(() => _editing = false);
      await _load();
      await ref.read(sessionProvider).refresh();
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _askCustom() async {
    final controller = TextEditingController();

    final asked = await showComposerSheet<bool>(
      context: context,
      title: 'Ask your own question',
      builder: (sheetContext) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SheetField(
            label: 'Your question',
            hint: "Replaces today's question for both of you.",
            child: TextField(
              controller: controller,
              autofocus: true,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: "What's something you've been carrying this week?",
              ),
            ),
          ),
          FilledButton(
            onPressed: () => Navigator.of(sheetContext).pop(true),
            child: const Text('Ask it'),
          ),
        ],
      ),
    );

    if (asked != true || controller.text.trim().isEmpty) return;

    try {
      await Api.askCustomQuestion(controller.text);
      await _load();
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final text = Theme.of(context).textTheme;

    if (_loading) {
      return const Scaffold(
        backgroundColor: Colors.transparent,
        body: LoadingView(label: 'Opening today…'),
      );
    }

    final question = _question;
    if (question == null) {
      return Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(title: const Text('Today')),
        body: Center(child: Text(_error ?? 'No question today.', style: text.bodyMedium)),
      );
    }

    final me = _answers.where((a) => a.authorId == session.userId).firstOrNull;
    final theirs = _answers.where((a) => a.authorId != session.userId).firstOrNull;
    final showComposer = me == null || _editing;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Today, Us'),
        actions: [
          TextButton(onPressed: _askCustom, child: const Text('Ask your own')),
        ],
      ),
      body: SafeArea(
        top: false,
        child: RefreshIndicator(
          onRefresh: _load,
          color: Ember.c400,
          backgroundColor: Dusk.c600,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Text(
                question.body,
                style: text.headlineMedium?.copyWith(height: 1.3),
              ),
              const SizedBox(height: 22),

              if (_error != null) ...[
                Text(_error!, style: TextStyle(color: Accent.flame, fontSize: 13)),
                const SizedBox(height: 12),
              ],

              if (showComposer)
                PaperCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextField(
                        controller: _draft,
                        autofocus: me == null,
                        maxLines: 6,
                        minLines: 4,
                        style: text.bodyLarge,
                        decoration: const InputDecoration(
                          hintText: 'Say the true thing, not the tidy one…',
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        question.partnerAnswered
                            ? '${session.partnerName} has already answered. Yours unlocks it.'
                            : "They won't see this until they've written theirs.",
                        style: text.bodySmall,
                      ),
                      const SizedBox(height: 14),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          if (_editing)
                            TextButton(
                              onPressed: () => setState(() {
                                _editing = false;
                                _draft.text = me?.body ?? '';
                              }),
                              child: const Text('Cancel'),
                            ),
                          const SizedBox(width: 8),
                          FilledButton(
                            onPressed: _saving ? null : _save,
                            child: _saving
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Dusk.c900,
                                    ),
                                  )
                                : Text(me == null ? 'Seal it' : 'Save'),
                          ),
                        ],
                      ),
                    ],
                  ),
                )
              else ...[
                _AnswerCard(
                  name: 'You',
                  avatarName: session.me?.displayName,
                  avatarUrl: session.me?.avatarUrl,
                  answer: me,
                  onEdit: () => setState(() {
                    _editing = true;
                    _draft.text = me.body;
                  }),
                ),
                const SizedBox(height: 12),

                if (question.revealed && theirs != null)
                  Unseal(
                    child: _AnswerCard(
                      name: session.partnerName,
                      avatarName: session.partner?.displayName,
                      avatarUrl: session.partner?.avatarUrl,
                      answer: theirs,
                      highlight: true,
                    ),
                  )
                else
                  Surface(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 44),
                    child: Column(
                      children: [
                        const SoftPulse(child: Text('🕯️', style: TextStyle(fontSize: 38))),
                        const SizedBox(height: 14),
                        Text(
                          'Waiting on ${session.partnerName}',
                          style: text.headlineSmall,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Their answer is already written or still coming — either way '
                          "it stays sealed until you both have one down. That's the whole point.",
                          style: text.bodySmall,
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _AnswerCard extends StatelessWidget {
  const _AnswerCard({
    required this.name,
    required this.answer,
    this.avatarName,
    this.avatarUrl,
    this.highlight = false,
    this.onEdit,
  });

  final String name;
  final DailyAnswer answer;
  final String? avatarName;
  final String? avatarUrl;
  final bool highlight;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Avatar(name: avatarName ?? name, url: avatarUrl, size: 34),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: text.titleMedium),
                  Text(whenLabel(answer.createdAt), style: text.bodySmall),
                ],
              ),
            ),
            if (onEdit != null)
              TextButton(
                onPressed: onEdit,
                style: TextButton.styleFrom(foregroundColor: Glow.c600),
                child: const Text('Edit'),
              ),
          ],
        ),
        const SizedBox(height: 12),
        Text(answer.body, style: text.bodyLarge?.copyWith(fontSize: 17, height: 1.55)),
      ],
    );

    return highlight
        ? PaperCard(glow: true, child: content)
        : Surface(child: content);
  }
}
