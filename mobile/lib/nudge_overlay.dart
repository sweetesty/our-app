import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'api.dart';
import 'models.dart';
import 'session.dart';
import 'theme.dart';
import 'widgets.dart';

/// Wraps every route and listens for nudges. Postgres pushes the insert down
/// the realtime socket, so the banner lands about as fast as they lift their
/// thumb — no polling, no server of our own.
class NudgeOverlay extends ConsumerStatefulWidget {
  const NudgeOverlay({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<NudgeOverlay> createState() => _NudgeOverlayState();
}

class _NudgeOverlayState extends ConsumerState<NudgeOverlay> {
  RealtimeChannel? _channel;
  String? _subscribedCoupleId;
  Nudge? _incoming;
  Timer? _dismissTimer;

  @override
  void initState() {
    super.initState();
    final session = ref.read(sessionProvider);
    session.addListener(_syncSubscription);
    _syncSubscription();
  }

  void _syncSubscription() {
    final session = ref.read(sessionProvider);
    final coupleId = session.coupleId;

    if (coupleId == _subscribedCoupleId) return;
    _subscribedCoupleId = coupleId;

    final old = _channel;
    _channel = null;
    if (old != null) unawaited(Api.disposeChannel(old));

    if (coupleId == null) return;

    _channel = Api.nudgeChannel(coupleId, (nudge) {
      // Your own tap comes back down the same socket. Ignore it.
      if (nudge.senderId == session.userId) return;
      if (!mounted) return;

      setState(() => _incoming = nudge);
      unawaited(Api.markNudgeSeen(nudge.id));

      _dismissTimer?.cancel();
      _dismissTimer = Timer(const Duration(seconds: 6), () {
        if (mounted) setState(() => _incoming = null);
      });
    });
  }

  @override
  void dispose() {
    _dismissTimer?.cancel();
    ref.read(sessionProvider).removeListener(_syncSubscription);
    final channel = _channel;
    if (channel != null) unawaited(Api.disposeChannel(channel));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final nudge = _incoming;

    return Stack(
      children: [
        widget.child,
        if (nudge != null)
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            left: 16,
            right: 16,
            child: _NudgeBanner(
              nudge: nudge,
              partnerName: ref.read(sessionProvider).partnerName,
              onDismiss: () => setState(() => _incoming = null),
            ),
          ),
      ],
    );
  }
}

class _NudgeBanner extends StatelessWidget {
  const _NudgeBanner({
    required this.nudge,
    required this.partnerName,
    required this.onDismiss,
  });

  final Nudge nudge;
  final String partnerName;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final meta = nudgeFor(nudge.kind);
    final text = Theme.of(context).textTheme;

    return Rise(
      child: Dismissible(
        key: ValueKey(nudge.id),
        direction: DismissDirection.up,
        onDismissed: (_) => onDismiss(),
        child: PaperCard(
          glow: true,
          onTap: onDismiss,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Row(
            children: [
              Text(meta.emoji, style: const TextStyle(fontSize: 26)),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$partnerName ${meta.sent}.',
                      style: text.bodyLarge?.copyWith(color: Glow.c100),
                    ),
                    if (nudge.message != null)
                      Text(
                        '“${nudge.message}”',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.bodySmall,
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
