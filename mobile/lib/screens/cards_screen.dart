import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

class CardsScreen extends ConsumerStatefulWidget {
  const CardsScreen({super.key});

  @override
  ConsumerState<CardsScreen> createState() => _CardsScreenState();
}

class _CardsScreenState extends ConsumerState<CardsScreen> {
  final _response = TextEditingController();

  List<CardDeck> _decks = [];
  CardDeck? _active;
  PlayCard? _card;
  bool _loading = true;
  bool _drawing = false;
  bool _exhausted = false;

  @override
  void initState() {
    super.initState();
    _loadDecks();
  }

  @override
  void dispose() {
    _response.dispose();
    super.dispose();
  }

  Future<void> _loadDecks() async {
    try {
      final decks = await Api.decks();
      if (mounted) setState(() => _decks = decks);
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _draw(CardDeck deck) async {
    setState(() {
      _active = deck;
      _drawing = true;
      _exhausted = false;
      _card = null;
      _response.clear();
    });

    try {
      final card = await Api.drawCard(deck.id);
      if (!mounted) return;
      setState(() {
        _card = card;
        _exhausted = card == null;
      });
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    } finally {
      if (mounted) setState(() => _drawing = false);
    }
  }

  /// Logging the play is what removes the card from the pool next time.
  Future<void> _finish({required bool withResponse}) async {
    final card = _card;
    final coupleId = ref.read(sessionProvider).coupleId;
    if (card == null || coupleId == null) return;

    try {
      await Api.playCard(
        coupleId,
        card.id,
        response: withResponse && _response.text.trim().isNotEmpty
            ? _response.text.trim()
            : null,
      );
      await Api.syncAchievements();
      await ref.read(sessionProvider).refresh();
      if (_active != null) await _draw(_active!);
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    }
  }

  Future<void> _newCard() async {
    final coupleId = ref.read(sessionProvider).coupleId;
    if (coupleId == null || _decks.isEmpty) return;

    final controller = TextEditingController();
    var deckId = _active?.id ?? _decks.first.id;
    var kind = 'question';

    final saved = await showComposerSheet<bool>(
      context: context,
      title: 'Write a card',
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SheetField(
              label: 'Deck',
              child: DropdownButtonFormField<String>(
                initialValue: deckId,
                dropdownColor: Dusk.c600,
                items: [
                  for (final d in _decks)
                    DropdownMenuItem(value: d.id, child: Text('${d.emoji}  ${d.name}')),
                ],
                onChanged: (v) => setSheetState(() => deckId = v ?? deckId),
              ),
            ),
            SheetField(
              label: 'Card',
              child: TextField(
                controller: controller,
                autofocus: true,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'The thing only the two of you would understand…',
                ),
              ),
            ),
            SheetField(
              label: 'Type',
              child: Row(
                children: [
                  for (final k in ['question', 'dare'])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: PillChip(
                        label: k == 'question' ? 'Question' : 'Dare',
                        selected: kind == k,
                        onTap: () => setSheetState(() => kind = k),
                      ),
                    ),
                ],
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.of(sheetContext).pop(true),
              child: const Text('Add to deck'),
            ),
          ],
        ),
      ),
    );

    if (saved != true || controller.text.trim().isEmpty) return;

    try {
      await Api.addCard(coupleId, deckId, controller.text, kind);
      if (_active != null) await _draw(_active!);
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    }
  }

  Future<void> _newDeck() async {
    final coupleId = ref.read(sessionProvider).coupleId;
    if (coupleId == null) return;

    final name = TextEditingController();
    final description = TextEditingController();
    var emoji = '✨';
    var accent = kDeckAccents.first;

    final saved = await showComposerSheet<bool>(
      context: context,
      title: 'New deck',
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SheetField(
              label: 'Name',
              child: TextField(
                controller: name,
                autofocus: true,
                maxLength: 40,
                decoration: const InputDecoration(
                  hintText: '3am thoughts',
                  counterText: '',
                ),
              ),
            ),
            SheetField(
              label: 'Emoji',
              child: Wrap(
                spacing: 8,
                children: [
                  for (final e in ['✨', '🌙', '🔥', '💭', '🎧', '🍜', '🫧', '🪩'])
                    PillChip(
                      label: e,
                      selected: emoji == e,
                      onTap: () => setSheetState(() => emoji = e),
                    ),
                ],
              ),
            ),
            SheetField(
              label: "What's it for?",
              child: TextField(
                controller: description,
                decoration: const InputDecoration(
                  hintText: "The questions we only ask when it's late",
                ),
              ),
            ),
            SheetField(
              label: 'Colour',
              child: Row(
                children: [
                  for (final c in kDeckAccents)
                    GestureDetector(
                      onTap: () => setSheetState(() => accent = c),
                      child: Container(
                        width: 34,
                        height: 34,
                        margin: const EdgeInsets.only(right: 10),
                        decoration: BoxDecoration(
                          color: hexColor(c),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: accent == c ? Glow.c100 : Colors.transparent,
                            width: 2,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.of(sheetContext).pop(true),
              child: const Text('Create deck'),
            ),
          ],
        ),
      ),
    );

    if (saved != true || name.text.trim().isEmpty) return;

    try {
      await Api.addDeck(
        coupleId,
        name: name.text,
        emoji: emoji,
        description: description.text,
        accent: accent,
      );
      await _loadDecks();
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(_active?.name ?? 'The deck'),
        leading: _active != null
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() {
                  _active = null;
                  _card = null;
                }),
              )
            : null,
        actions: [
          if (_active == null)
            TextButton(onPressed: _newDeck, child: const Text('+ Deck')),
          if (_active != null)
            TextButton(onPressed: _newCard, child: const Text('+ Card')),
        ],
      ),
      body: SafeArea(
        top: false,
        child: _loading
            ? const LoadingView(label: 'Shuffling…')
            : _active == null
                ? _deckGrid(text)
                : _drawing
                    ? const LoadingView(label: 'Drawing…')
                    : _exhausted
                        ? _exhaustedView()
                        : _card != null
                            ? _cardView(text)
                            : const SizedBox.shrink(),
      ),
    );
  }

  Widget _deckGrid(TextTheme text) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        Text(
          'Five to start with. Write your own whenever you want.',
          style: text.bodyMedium,
        ),
        const SizedBox(height: 18),
        for (var i = 0; i < _decks.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Rise(
              index: i,
              child: Surface(
                onTap: () => _draw(_decks[i]),
                borderColor: hexColor(_decks[i].accent, 0.3),
                gradientFrom: hexColor(_decks[i].accent, 0.12),
                child: Row(
                  children: [
                    Text(_decks[i].emoji, style: const TextStyle(fontSize: 30)),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(_decks[i].name, style: text.titleLarge),
                              if (_decks[i].isCustom) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Dusk.c800.withValues(alpha: 0.7),
                                    borderRadius: BorderRadius.circular(99),
                                  ),
                                  child: Text('yours', style: text.bodySmall),
                                ),
                              ],
                            ],
                          ),
                          if (_decks[i].description != null)
                            Text(_decks[i].description!, style: text.bodySmall),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _exhaustedView() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: EmptyView(
        emoji: _active!.emoji,
        title: "You've played every card in here",
        body: _active!.slug == 'inside_joke'
            ? 'This deck ships empty on purpose — nobody else could write it.'
            : 'Add your own cards, or go back and pick another deck.',
        action: FilledButton(
          onPressed: _newCard,
          child: const Text('Write a new one'),
        ),
      ),
    );
  }

  Widget _cardView(TextTheme text) {
    final accent = hexColor(_active!.accent);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        Unseal(
          key: ValueKey(_card!.id),
          child: PaperCard(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 44),
            borderColor: accent.withValues(alpha: 0.35),
            gradientFrom: accent.withValues(alpha: 0.16),
            child: Column(
              children: [
                SectionLabel(
                  _card!.isDare ? 'Dare' : _active!.name,
                  color: accent,
                ),
                const SizedBox(height: 16),
                Text(
                  _card!.body,
                  textAlign: TextAlign.center,
                  style: text.headlineSmall?.copyWith(height: 1.35, fontSize: 23),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _response,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: _card!.isDare
                ? 'Say when it’s done…'
                : 'Answer out loud, or write it here…',
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () => _finish(withResponse: true),
          child: Text(_card!.isDare ? 'Done — next' : 'Answered — next'),
        ),
        const SizedBox(height: 10),
        OutlinedButton(
          onPressed: () => _finish(withResponse: false),
          child: const Text('Skip this one'),
        ),
      ],
    );
  }
}
