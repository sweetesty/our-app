import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'cards_screen.dart';
import 'today_screen.dart';
import 'us_screen.dart';
import 'vault_screen.dart';

/// The five tabs live in an IndexedStack so switching between them keeps scroll
/// position and half-typed answers. Notes, Timeline, Nudges and Settings are
/// pushed from the Home tab instead of crowding the bar.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  void _openTab(int index) => setState(() => _index = index);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: IndexedStack(
        index: _index,
        children: [
          HomeTab(onOpenTab: _openTab),
          const TodayScreen(),
          const CardsScreen(),
          const VaultScreen(),
          const UsScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          backgroundColor: Dusk.c800.withValues(alpha: 0.94),
          indicatorColor: Ember.c400.withValues(alpha: 0.14),
          labelTextStyle: WidgetStateProperty.resolveWith(
            (states) => TextStyle(
              fontSize: 11,
              color: states.contains(WidgetState.selected) ? Ember.c300 : Glow.c600,
            ),
          ),
        ),
        child: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: _openTab,
          height: 66,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: const [
            NavigationDestination(icon: Text('🕯️', style: TextStyle(fontSize: 20)), label: 'Home'),
            NavigationDestination(icon: Text('💌', style: TextStyle(fontSize: 20)), label: 'Today'),
            NavigationDestination(icon: Text('🃏', style: TextStyle(fontSize: 20)), label: 'Cards'),
            NavigationDestination(icon: Text('🔒', style: TextStyle(fontSize: 20)), label: 'Vault'),
            NavigationDestination(icon: Text('🏆', style: TextStyle(fontSize: 20)), label: 'Us'),
          ],
        ),
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */

class HomeTab extends ConsumerStatefulWidget {
  const HomeTab({super.key, required this.onOpenTab});

  final void Function(int) onOpenTab;

  @override
  ConsumerState<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends ConsumerState<HomeTab> {
  TodayQuestion? _today;
  bool _loading = true;
  bool _sent = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final today = await Api.todayQuestion();
      if (mounted) setState(() => _today = today);
    } catch (_) {
      // Home still renders without it; the Today tab surfaces the real error.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _refresh() async {
    await ref.read(sessionProvider).refresh();
    await _load();
  }

  Future<void> _quickMiss() async {
    try {
      await Api.sendNudge('miss_you');
      if (!mounted) return;
      setState(() => _sent = true);
      await ref.read(sessionProvider).refresh();
      Future.delayed(const Duration(milliseconds: 2400), () {
        if (mounted) setState(() => _sent = false);
      });
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    }
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 5) return 'Still up';
    if (h < 12) return 'Morning';
    if (h < 18) return 'Afternoon';
    return 'Evening';
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);

    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        if (_loading) return const LoadingView();

        final text = Theme.of(context).textTheme;
        final summary = session.summary;
        final partner = session.partner;
        final days = summary?.couple?.daysTogether;
        final readyVault = summary?.readyVault ?? 0;
        final unreadNotes = summary?.unreadNotes ?? 0;
        final lastNudge = summary?.latestNudge;

        return SafeArea(
          child: RefreshIndicator(
            onRefresh: _refresh,
            color: Ember.c400,
            backgroundColor: Dusk.c600,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
              children: [
                SectionLabel('${_greeting()}, ${session.me?.displayName ?? ''}'),
                const SizedBox(height: 6),
                Text(
                  partner != null ? 'You and ${partner.displayName}' : 'Waiting on them',
                  style: text.headlineMedium,
                ),
                if (days != null)
                  Text('${_thousands(days)} days in', style: text.bodyMedium),
                const SizedBox(height: 22),

                if (partner == null) ...[
                  Rise(
                    child: PaperCard(
                      glow: true,
                      onTap: () => context.push('/settings'),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Your space is still one person', style: text.bodyLarge),
                          const SizedBox(height: 6),
                          Text(
                            "Send them your invite code — it's in Settings.",
                            style: text.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                // Today
                Rise(
                  index: 1,
                  child: _todayCard(context, text),
                ),
                const SizedBox(height: 12),

                if (readyVault > 0) ...[
                  Rise(
                    index: 2,
                    child: PaperCard(
                      glow: true,
                      onTap: () => widget.onOpenTab(3),
                      child: Row(
                        children: [
                          const SoftPulse(child: Text('✨', style: TextStyle(fontSize: 26))),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '$readyVault letter${readyVault > 1 ? 's' : ''} ready to open',
                                  style: text.bodyLarge,
                                ),
                                Text(
                                  'They left ${readyVault > 1 ? 'them' : 'it'} for you.',
                                  style: text.bodyMedium,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                if (unreadNotes > 0) ...[
                  Rise(
                    index: 3,
                    child: Surface(
                      onTap: () => context.push('/notes'),
                      child: Row(
                        children: [
                          const Text('📌', style: TextStyle(fontSize: 24)),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Text(
                              "$unreadNotes note${unreadNotes > 1 ? 's' : ''} you haven't read",
                              style: text.bodyLarge,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                // The big one
                Rise(
                  index: 4,
                  child: Surface(
                    onTap: _quickMiss,
                    child: Row(
                      children: [
                        Text(_sent ? '💌' : '🥺', style: const TextStyle(fontSize: 30)),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(_sent ? 'Sent.' : 'I miss you', style: text.bodyLarge),
                              Text(
                                _sent
                                    ? '${session.partnerName} will see it in a second'
                                    : lastNudge != null
                                        ? '${session.partnerName} ${nudgeFor(lastNudge.kind).sent} ${agoLabel(lastNudge.createdAt)}'
                                        : 'One tap, straight to their phone',
                                style: text.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        Text('tap', style: text.bodySmall),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 1.7,
                  children: [
                    _Tile(emoji: '📌', label: 'Love notes', onTap: () => context.push('/notes')),
                    _Tile(emoji: '🗓️', label: 'Timeline', onTap: () => context.push('/timeline')),
                    _Tile(emoji: '🫂', label: 'Nudges', onTap: () => context.push('/nudges')),
                    _Tile(emoji: '⚙️', label: 'Settings', onTap: () => context.push('/settings')),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _todayCard(BuildContext context, TextTheme text) {
    final answered = _today?.myAnswer != null;

    final status = _today == null
        ? ''
        : _today!.revealed
            ? 'unlocked ✨'
            : answered
                ? 'waiting on them'
                : _today!.partnerAnswered
                    ? 'they answered — your turn'
                    : 'unanswered';

    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const SectionLabel('Today, Us'),
            const Spacer(),
            Text(status, style: text.bodySmall),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          _today?.body ?? "Open today's question",
          style: text.titleLarge?.copyWith(fontSize: 20, height: 1.35),
        ),
        if (!answered) ...[
          const SizedBox(height: 12),
          Text(
            'Write your answer →',
            style: text.bodyMedium?.copyWith(color: Ember.c300),
          ),
        ],
      ],
    );

    return answered
        ? Surface(onTap: () => widget.onOpenTab(1), child: content)
        : PaperCard(glow: true, onTap: () => widget.onOpenTab(1), child: content);
  }
}

String _thousands(int value) {
  final s = value.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buffer.write(',');
    buffer.write(s[i]);
  }
  return buffer.toString();
}

class _Tile extends StatelessWidget {
  const _Tile({required this.emoji, required this.label, required this.onTap});

  final String emoji;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Surface(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 24)),
          const SizedBox(height: 6),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
