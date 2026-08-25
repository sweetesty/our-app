import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

class NotesScreen extends ConsumerStatefulWidget {
  const NotesScreen({super.key});

  @override
  ConsumerState<NotesScreen> createState() => _NotesScreenState();
}

class _NotesScreenState extends ConsumerState<NotesScreen> {
  List<LoveNote> _notes = [];
  bool _loading = true;
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final notes = await Api.notes();
      if (mounted) setState(() => _notes = notes);
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(LoveNote note) async {
    final mine = note.authorId == ref.read(sessionProvider).userId;

    // Only marks rows your partner wrote — the RPC filters on author <> you.
    if (!mine && note.readAt == null) {
      await Api.markNoteRead(note.id);
      await _load();
    }

    if (!mounted) return;
    final text = Theme.of(context).textTheme;

    await showComposerSheet<void>(
      context: context,
      title: note.title ?? moodFor(note.mood).label,
      builder: (sheetContext) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(note.body, style: text.bodyLarge?.copyWith(fontSize: 17, height: 1.6)),
          const SizedBox(height: 18),
          Text(
            '${mine ? 'You wrote this' : 'They wrote this'} · ${whenLabel(note.createdAt)}',
            style: text.bodySmall,
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () async {
                    Navigator.of(sheetContext).pop();
                    await Api.toggleNotePin(note.id);
                    await _load();
                  },
                  child: Text(note.isPinned ? 'Unpin' : 'Pin to top'),
                ),
              ),
              if (mine) ...[
                const SizedBox(width: 10),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Accent.flame,
                    side: BorderSide(color: Accent.flame.withValues(alpha: 0.4)),
                  ),
                  onPressed: () async {
                    Navigator.of(sheetContext).pop();
                    await Api.deleteNote(note.id);
                    await _load();
                  },
                  child: const Text('Delete'),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _compose() async {
    final coupleId = ref.read(sessionProvider).coupleId;
    if (coupleId == null) return;

    final title = TextEditingController();
    final body = TextEditingController();
    var mood = kMoods.first.value;
    var pinned = false;

    final saved = await showComposerSheet<bool>(
      context: context,
      title: 'Leave a note',
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SheetField(
              label: 'Title',
              hint: 'Optional — a good one gets opened at the right moment.',
              child: TextField(
                controller: title,
                maxLength: 80,
                decoration: const InputDecoration(
                  hintText: "Read this when you're having a bad day",
                  counterText: '',
                ),
              ),
            ),
            SheetField(
              label: 'The note',
              child: TextField(
                controller: body,
                maxLines: 6,
                minLines: 4,
                decoration: const InputDecoration(
                  hintText: "Whatever you'd want them to hear in your voice…",
                ),
              ),
            ),
            SheetField(
              label: 'What kind of note?',
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final m in kMoods)
                    PillChip(
                      label: '${m.emoji} ${m.label}',
                      selected: mood == m.value,
                      onTap: () => setSheetState(() => mood = m.value),
                    ),
                ],
              ),
            ),
            SwitchListTile(
              value: pinned,
              onChanged: (v) => setSheetState(() => pinned = v),
              activeThumbColor: Ember.c400,
              contentPadding: EdgeInsets.zero,
              title: Text(
                'Pin this to the top of the wall',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () => Navigator.of(sheetContext).pop(true),
              child: const Text('Leave it'),
            ),
          ],
        ),
      ),
    );

    if (saved != true || body.text.trim().isEmpty) return;

    try {
      await Api.addNote(
        coupleId,
        title: title.text,
        body: body.text,
        mood: mood,
        pinned: pinned,
      );
      await Api.syncAchievements();
      await _load();
      await ref.read(sessionProvider).refresh();
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final userId = ref.watch(sessionProvider).userId;
    final text = Theme.of(context).textTheme;

    final visible = _notes.where((n) {
      if (_filter == 'mine') return n.authorId == userId;
      if (_filter == 'theirs') return n.authorId != userId;
      return true;
    }).toList();

    final pinned = visible.where((n) => n.isPinned).toList();
    final rest = visible.where((n) => !n.isPinned).toList();

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: const Text('Love notes')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _compose,
        backgroundColor: Ember.c400,
        foregroundColor: Dusk.c900,
        icon: const Icon(Icons.edit_outlined, size: 18),
        label: const Text('Leave a note'),
      ),
      body: SafeArea(
        top: false,
        child: _loading
            ? const LoadingView(label: 'Reading the wall…')
            : RefreshIndicator(
                onRefresh: _load,
                color: Ember.c400,
                backgroundColor: Dusk.c600,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 96),
                  children: [
                    Text(
                      'Things worth writing down. Pin the ones that should stay at the top.',
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        for (final f in [
                          ('all', 'Everything'),
                          ('mine', 'From me'),
                          ('theirs', 'From them'),
                        ])
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: PillChip(
                              label: f.$2,
                              selected: _filter == f.$1,
                              onTap: () => setState(() => _filter = f.$1),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 18),

                    if (visible.isEmpty)
                      EmptyView(
                        emoji: '📌',
                        title: 'Nothing on the wall yet',
                        body: "Try “Read this when you're having a bad day” — then leave "
                            'it here for whenever they need it.',
                        action: FilledButton(
                          onPressed: _compose,
                          child: const Text('Write the first one'),
                        ),
                      ),

                    if (pinned.isNotEmpty) ...[
                      const SectionLabel('Pinned'),
                      const SizedBox(height: 10),
                      for (var i = 0; i < pinned.length; i++)
                        _noteTile(pinned[i], userId, i),
                      const SizedBox(height: 18),
                    ],

                    if (rest.isNotEmpty) ...[
                      if (pinned.isNotEmpty) ...[
                        const SectionLabel('Everything else'),
                        const SizedBox(height: 10),
                      ],
                      for (var i = 0; i < rest.length; i++)
                        _noteTile(rest[i], userId, i),
                    ],
                  ],
                ),
              ),
      ),
    );
  }

  Widget _noteTile(LoveNote note, String? userId, int index) {
    final text = Theme.of(context).textTheme;
    final mine = note.authorId == userId;
    final unread = !mine && note.readAt == null;
    final mood = moodFor(note.mood);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Rise(
        index: index,
        child: PaperCard(
          onTap: () => _open(note),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(mood.emoji, style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: 8),
                  SectionLabel(mine ? 'From you' : 'For you'),
                  const Spacer(),
                  if (unread)
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Ember.c400,
                        shape: BoxShape.circle,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              if (note.title != null) ...[
                Text(note.title!, style: text.bodyLarge),
                const SizedBox(height: 4),
              ],
              Text(
                note.body,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: text.bodyMedium,
              ),
              const SizedBox(height: 10),
              Text(
                '${note.isPinned ? '📌 ' : ''}${whenLabel(note.createdAt)}',
                style: text.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
