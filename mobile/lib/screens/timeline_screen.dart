import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

class TimelineScreen extends ConsumerStatefulWidget {
  const TimelineScreen({super.key});

  @override
  ConsumerState<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends ConsumerState<TimelineScreen> {
  List<Milestone> _milestones = [];
  Map<String, List<MilestoneMedia>> _media = {};
  Map<String, String> _urls = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final milestones = await Api.milestones();
      final media = await Api.milestoneMedia();

      final grouped = <String, List<MilestoneMedia>>{};
      for (final item in media) {
        grouped.putIfAbsent(item.milestoneId, () => []).add(item);
      }

      // One batched signing call rather than one per attachment.
      final urls = await Api.signedUrls(media.map((m) => m.storagePath).toList());

      if (!mounted) return;
      setState(() {
        _milestones = milestones;
        _media = grouped;
        _urls = urls;
      });
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _compose({Milestone? existing}) async {
    final coupleId = ref.read(sessionProvider).coupleId;
    if (coupleId == null) return;

    final title = TextEditingController(text: existing?.title ?? '');
    final description = TextEditingController(text: existing?.description ?? '');
    var happenedOn = existing?.happenedOn ?? DateTime.now();
    var icon = existing?.icon ?? kMilestoneIcons.first;
    var picked = <File>[];

    final saved = await showComposerSheet<bool>(
      context: context,
      title: existing == null ? 'Add a moment' : 'Edit this moment',
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SheetField(
              label: 'What happened?',
              child: TextField(
                controller: title,
                autofocus: existing == null,
                maxLength: 90,
                decoration: const InputDecoration(
                  hintText: 'The first call that went until 4am',
                  counterText: '',
                ),
              ),
            ),
            SheetField(
              label: 'When',
              child: OutlinedButton(
                onPressed: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: happenedOn,
                    firstDate: DateTime(1990),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (date != null) setSheetState(() => happenedOn = date);
                },
                child: Text(longDate(happenedOn)),
              ),
            ),
            SheetField(
              label: 'Icon',
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final i in kMilestoneIcons)
                    PillChip(
                      label: i,
                      selected: icon == i,
                      onTap: () => setSheetState(() => icon = i),
                    ),
                ],
              ),
            ),
            SheetField(
              label: 'Tell it properly',
              child: TextField(
                controller: description,
                maxLines: 4,
                decoration: const InputDecoration(
                  hintText: 'What you remember. What they said.',
                ),
              ),
            ),
            SheetField(
              label: 'Photos, voice notes, video',
              child: OutlinedButton.icon(
                onPressed: () async {
                  final result = await FilePicker.pickFiles(
                    type: FileType.media,
                  );
                  if (result.isEmpty) return;
                  setSheetState(() {
                    picked = result
                        .where((f) => f.path != null)
                        .map((f) => File(f.path!))
                        .toList();
                  });
                },
                icon: const Icon(Icons.attach_file, size: 18),
                label: Text(
                  picked.isEmpty
                      ? 'Attach something'
                      : '${picked.length} file${picked.length > 1 ? 's' : ''} ready',
                ),
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.of(sheetContext).pop(true),
              child: Text(existing == null ? 'Add it' : 'Save'),
            ),
            if (existing != null) ...[
              const SizedBox(height: 8),
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  foregroundColor: Accent.flame,
                  side: BorderSide(color: Accent.flame.withValues(alpha: 0.4)),
                ),
                onPressed: () => Navigator.of(sheetContext).pop(false),
                child: const Text('Delete this moment'),
              ),
            ],
          ],
        ),
      ),
    );

    if (saved == null) return;

    try {
      if (saved == false && existing != null) {
        final paths =
            (_media[existing.id] ?? []).map((m) => m.storagePath).toList();
        await Api.deleteMilestone(existing.id, paths);
      } else {
        if (title.text.trim().isEmpty) return;
        final id = await Api.saveMilestone(
          coupleId,
          id: existing?.id,
          title: title.text,
          description: description.text,
          happenedOn: happenedOn,
          icon: icon,
        );
        for (final file in picked) {
          await Api.attachToMilestone(coupleId, id, file);
        }
      }

      await Api.syncAchievements();
      await _load();
      await ref.read(sessionProvider).refresh();
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: const Text('Timeline')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _compose(),
        backgroundColor: Ember.c400,
        foregroundColor: Dusk.c900,
        icon: const Icon(Icons.add, size: 18),
        label: const Text('Add a moment'),
      ),
      body: SafeArea(
        top: false,
        child: _loading
            ? const LoadingView(label: 'Walking it back…')
            : RefreshIndicator(
                onRefresh: _load,
                color: Ember.c400,
                backgroundColor: Dusk.c600,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 96),
                  children: [
                    Text(
                      'The beginning, the first call, the first time you said it. '
                      'Everything since.',
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 20),

                    if (_milestones.isEmpty)
                      EmptyView(
                        emoji: '🗓️',
                        title: 'The story starts somewhere',
                        body: 'Add the first moment and the thread starts drawing itself.',
                        action: FilledButton(
                          onPressed: () => _compose(),
                          child: const Text('Add the beginning'),
                        ),
                      ),

                    for (var i = 0; i < _milestones.length; i++)
                      _entry(_milestones[i], i, i == _milestones.length - 1),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _entry(Milestone milestone, int index, bool isLast) {
    final text = Theme.of(context).textTheme;
    final attachments = _media[milestone.id] ?? [];

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // the thread
          SizedBox(
            width: 30,
            child: Column(
              children: [
                Container(
                  width: 26,
                  height: 26,
                  margin: const EdgeInsets.only(top: 18),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Dusk.c700,
                    shape: BoxShape.circle,
                    border: Border.all(color: Dusk.c400),
                  ),
                  child: Text(milestone.icon, style: const TextStyle(fontSize: 12)),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 1,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: Dusk.c400,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),

          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Rise(
                index: index,
                child: Surface(
                  onTap: () => _compose(existing: milestone),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SectionLabel(longDate(milestone.happenedOn)),
                      const SizedBox(height: 6),
                      Text(milestone.title, style: text.titleLarge),
                      if (milestone.description != null) ...[
                        const SizedBox(height: 8),
                        Text(milestone.description!, style: text.bodyMedium),
                      ],
                      if (attachments.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final item in attachments)
                              MediaThumb(item: item, url: _urls[item.storagePath]),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class MediaThumb extends StatelessWidget {
  const MediaThumb({super.key, required this.item, this.url});

  final MilestoneMedia item;
  final String? url;

  @override
  Widget build(BuildContext context) {
    if (item.mediaType == 'photo' && url != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Image.network(
          url!,
          width: 78,
          height: 78,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => _placeholder('📷'),
        ),
      );
    }

    return _placeholder(switch (item.mediaType) {
      'voice' => '🎙️',
      'video' => '🎬',
      _ => '📷',
    });
  }

  Widget _placeholder(String emoji) => Container(
    width: 78,
    height: 78,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: Dusk.c700,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(emoji, style: const TextStyle(fontSize: 22)),
  );
}
