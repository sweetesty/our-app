import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

class VaultScreen extends ConsumerStatefulWidget {
  const VaultScreen({super.key});

  @override
  ConsumerState<VaultScreen> createState() => _VaultScreenState();
}

class _VaultScreenState extends ConsumerState<VaultScreen> {
  List<VaultItem> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await Api.vaultItems();
      if (mounted) setState(() => _items = items);
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openItem(VaultItem item) async {
    final session = ref.read(sessionProvider);
    final mine = item.authorId == session.userId;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Dusk.c700,
      builder: (sheetContext) => _VaultReader(
        item: item,
        mine: mine,
        onChanged: _load,
      ),
    );
    await _load();
  }

  Future<void> _seal() async {
    final session = ref.read(sessionProvider);
    final coupleId = session.coupleId;
    final partnerId = session.partner?.id;

    if (coupleId == null) return;
    if (partnerId == null) {
      showError(
        context,
        '',
        'Once ${session.partnerName} joins your space you can leave letters for them.',
      );
      return;
    }

    final label = TextEditingController();
    final body = TextEditingController();
    var mode = 'date';
    var unlockAt = DateTime.now().add(const Duration(days: 30));
    var condition = kConditionPresets.first;
    File? attachment;

    final saved = await showComposerSheet<bool>(
      context: context,
      title: 'Seal something for ${session.partnerName}',
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SheetField(
              label: "What they'll see on the outside",
              child: TextField(
                controller: label,
                autofocus: true,
                maxLength: 70,
                decoration: const InputDecoration(
                  hintText: 'Open on your birthday',
                  counterText: '',
                ),
              ),
            ),
            SheetField(
              label: 'When does it open?',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: PillChip(
                          label: 'On a date',
                          selected: mode == 'date',
                          onTap: () => setSheetState(() => mode = 'date'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: PillChip(
                          label: 'When they need it',
                          selected: mode == 'condition',
                          onTap: () => setSheetState(() => mode = 'condition'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (mode == 'date')
                    OutlinedButton(
                      onPressed: () async {
                        final date = await showDatePicker(
                          context: context,
                          initialDate: unlockAt,
                          firstDate: DateTime.now(),
                          lastDate: DateTime.now().add(
                            const Duration(days: 365 * 20),
                          ),
                        );
                        if (date != null) setSheetState(() => unlockAt = date);
                      },
                      child: Text(longDate(unlockAt)),
                    )
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final c in kConditionPresets)
                          PillChip(
                            label: c,
                            selected: condition == c,
                            onTap: () => setSheetState(() => condition = c),
                          ),
                      ],
                    ),
                ],
              ),
            ),
            SheetField(
              label: 'The letter',
              child: TextField(
                controller: body,
                maxLines: 6,
                minLines: 4,
                decoration: const InputDecoration(
                  hintText: "Write it like they're reading it on the day, not today…",
                ),
              ),
            ),
            SheetField(
              label: 'Attach something',
              hint: 'A photo, a voice note, a video. Optional.',
              child: OutlinedButton.icon(
                onPressed: () async {
                  final result = await FilePicker.pickFile(
                    type: FileType.media,
                  );
                  final path = result?.path;
                  if (path != null) {
                    setSheetState(() => attachment = File(path));
                  }
                },
                icon: const Icon(Icons.attach_file, size: 18),
                label: Text(
                  attachment == null ? 'Attach something' : '1 file ready',
                ),
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.of(sheetContext).pop(true),
              child: const Text('Seal it'),
            ),
          ],
        ),
      ),
    );

    if (saved != true || label.text.trim().isEmpty) return;

    try {
      await Api.sealVaultItem(
        coupleId,
        recipientId: partnerId,
        label: label.text,
        unlockType: mode,
        unlockAt: unlockAt,
        unlockCondition: condition,
        body: body.text,
        attachment: attachment,
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
    final session = ref.watch(sessionProvider);
    final text = Theme.of(context).textTheme;

    final forMe = _items.where((i) => i.recipientId == session.userId).toList();
    final fromMe = _items
        .where((i) => i.authorId == session.userId && i.recipientId != session.userId)
        .toList();

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: const Text('The vault')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _seal,
        backgroundColor: Ember.c400,
        foregroundColor: Dusk.c900,
        icon: const Icon(Icons.lock_outline, size: 18),
        label: const Text('Seal something'),
      ),
      body: SafeArea(
        top: false,
        child: _loading
            ? const LoadingView(label: 'Checking the vault…')
            : RefreshIndicator(
                onRefresh: _load,
                color: Ember.c400,
                backgroundColor: Dusk.c600,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 96),
                  children: [
                    Text(
                      'Letters that open later — on a date, or the moment they need it.',
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 20),

                    if (_items.isEmpty)
                      EmptyView(
                        emoji: '🔒',
                        title: 'Nothing sealed yet',
                        body: 'Write something for their birthday, or for the day they '
                            'need it most, and leave it here until then.',
                        action: FilledButton(
                          onPressed: _seal,
                          child: const Text('Write the first letter'),
                        ),
                      ),

                    if (forMe.isNotEmpty) ...[
                      const SectionLabel('Waiting for you'),
                      const SizedBox(height: 10),
                      for (var i = 0; i < forMe.length; i++)
                        _card(forMe[i], mine: false, index: i),
                      const SizedBox(height: 18),
                    ],

                    if (fromMe.isNotEmpty) ...[
                      SectionLabel('You left these for ${session.partnerName}'),
                      const SizedBox(height: 10),
                      for (var i = 0; i < fromMe.length; i++)
                        _card(fromMe[i], mine: true, index: i),
                    ],
                  ],
                ),
              ),
      ),
    );
  }

  Widget _card(VaultItem item, {required bool mine, required int index}) {
    final text = Theme.of(context).textTheme;
    final ready = item.isReady;
    final opened = item.isOpened;
    final glowing = ready && !mine && !opened;

    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          opened
              ? '📖'
              : glowing
                  ? '✨'
                  : '🔒',
          style: const TextStyle(fontSize: 24),
        ),
        const SizedBox(height: 10),
        Text(item.label, style: text.bodyLarge),
        const SizedBox(height: 6),
        Text(
          item.unlockType == 'condition'
              ? 'Open ${item.unlockCondition}'
              : opened
                  ? 'Opened ${whenLabel(item.unlockedAt!)}'
                  : ready
                      ? 'Ready to open'
                      : untilUnlock(item.unlockAt),
          style: text.bodySmall,
        ),
      ],
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Rise(
        index: index,
        child: glowing
            ? PaperCard(glow: true, onTap: () => _openItem(item), child: content)
            : Surface(onTap: () => _openItem(item), child: content),
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */

class _VaultReader extends ConsumerStatefulWidget {
  const _VaultReader({
    required this.item,
    required this.mine,
    required this.onChanged,
  });

  final VaultItem item;
  final bool mine;
  final Future<void> Function() onChanged;

  @override
  ConsumerState<_VaultReader> createState() => _VaultReaderState();
}

class _VaultReaderState extends ConsumerState<_VaultReader> {
  VaultContents? _contents;
  String? _url;
  bool _busy = false;
  bool _justOpened = false;
  String? _error;

  bool get _showContents =>
      widget.mine || widget.item.isOpened || _justOpened;

  @override
  void initState() {
    super.initState();
    if (_showContents) _fetch();
  }

  Future<void> _fetch() async {
    // RLS returns nothing here unless you wrote it, or it is genuinely unlocked.
    final contents = await Api.vaultContents(widget.item.id);
    final url = contents?.mediaPath == null
        ? null
        : await Api.signedUrl(contents!.mediaPath!);

    if (!mounted) return;
    setState(() {
      _contents = contents;
      _url = url;
    });
  }

  Future<void> _unlock() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await Api.unlockVaultItem(widget.item.id);
      if (mounted) setState(() => _justOpened = true);
      await _fetch();
      await widget.onChanged();
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final item = widget.item;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 8,
        bottom: MediaQuery.of(context).viewInsets.bottom + 28,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 38,
                height: 4,
                margin: const EdgeInsets.only(top: 4, bottom: 18),
                decoration: BoxDecoration(
                  color: Dusk.c400,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            Text(item.label, style: text.headlineSmall),
            const SizedBox(height: 18),

            if (_showContents)
              Unseal(child: _contentsView(text))
            else if (item.isReady)
              Column(
                children: [
                  const SoftPulse(child: Text('✨', style: TextStyle(fontSize: 46))),
                  const SizedBox(height: 14),
                  Text(
                    item.unlockType == 'condition'
                        ? 'They left this for you — open it ${item.unlockCondition}.'
                        : 'This one is ready.',
                    style: text.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: TextStyle(color: Accent.flame, fontSize: 13)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy ? null : _unlock,
                    child: _busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Dusk.c900,
                            ),
                          )
                        : const Text('Break the seal'),
                  ),
                ],
              )
            else
              Column(
                children: [
                  const Text('🔒', style: TextStyle(fontSize: 46)),
                  const SizedBox(height: 12),
                  Text(untilUnlock(item.unlockAt), style: text.bodyMedium),
                  const SizedBox(height: 8),
                  Text(
                    'Not even the app can show you this one early — the words are '
                    'behind a database rule, not a locked button.',
                    style: text.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),

            if (widget.mine) ...[
              const SizedBox(height: 24),
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  foregroundColor: Accent.flame,
                  side: BorderSide(color: Accent.flame.withValues(alpha: 0.4)),
                ),
                onPressed: () async {
                  await Api.deleteVaultItem(item.id);
                  await widget.onChanged();
                  if (context.mounted) Navigator.of(context).pop();
                },
                child: const Text('Delete this letter'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _contentsView(TextTheme text) {
    final item = widget.item;
    final contents = _contents;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (contents?.body != null && contents!.body!.isNotEmpty)
          Text(
            contents.body!,
            style: text.bodyLarge?.copyWith(fontSize: 17, height: 1.6),
          ),

        if (_url != null && contents?.mediaType == 'photo') ...[
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Image.network(_url!),
          ),
        ],

        if (_url != null && contents?.mediaType != 'photo') ...[
          const SizedBox(height: 16),
          Surface(
            child: Row(
              children: [
                Text(
                  contents?.mediaType == 'voice' ? '🎙️' : '🎬',
                  style: const TextStyle(fontSize: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    contents?.mediaType == 'voice'
                        ? 'They left a voice note.'
                        : 'They left a video.',
                    style: text.bodyMedium,
                  ),
                ),
              ],
            ),
          ),
        ],

        if (contents == null || contents.isEmpty) ...[
          const SizedBox(height: 8),
          Text('This one was left empty.', style: text.bodySmall),
        ],

        const SizedBox(height: 18),
        Text(
          widget.mine
              ? item.isOpened
                  ? 'They opened this ${whenLabel(item.unlockedAt!)}.'
                  : item.isReady
                      ? 'Waiting for them to open it.'
                      : '${untilUnlock(item.unlockAt)}.'
              : 'Sealed ${whenLabel(item.createdAt)}.',
          style: text.bodySmall,
        ),
      ],
    );
  }
}
