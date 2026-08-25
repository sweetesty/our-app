import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'theme.dart';

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

Color hexColor(String hex, [double opacity = 1]) {
  final clean = hex.replaceAll('#', '');
  final value = int.tryParse(clean, radix: 16) ?? 0xB98AC9;
  return Color(0xFF000000 | value).withValues(alpha: opacity);
}

String whenLabel(DateTime dt) {
  final now = DateTime.now();
  final sameDay =
      dt.year == now.year && dt.month == now.month && dt.day == now.day;
  final yesterday = now.subtract(const Duration(days: 1));
  final wasYesterday = dt.year == yesterday.year &&
      dt.month == yesterday.month &&
      dt.day == yesterday.day;

  if (sameDay) return 'today at ${DateFormat.jm().format(dt)}';
  if (wasYesterday) return 'yesterday at ${DateFormat.jm().format(dt)}';
  return DateFormat('d MMM yyyy').format(dt);
}

String agoLabel(DateTime dt) {
  final diff = DateTime.now().difference(dt);
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 30) return '${diff.inDays}d ago';
  return DateFormat('d MMM').format(dt);
}

String longDate(DateTime dt) => DateFormat('d MMMM yyyy').format(dt);

/// "opens in 3 days" — the wait, phrased kindly.
String untilUnlock(DateTime? target) {
  if (target == null) return '';
  final diff = target.difference(DateTime.now());
  if (diff.isNegative) return 'ready now';
  if (diff.inDays > 45) return 'opens ${DateFormat('d MMM yyyy').format(target)}';
  if (diff.inDays >= 1) {
    return 'opens in ${diff.inDays} day${diff.inDays == 1 ? '' : 's'}';
  }
  if (diff.inHours >= 1) {
    return 'opens in ${diff.inHours} hour${diff.inHours == 1 ? '' : 's'}';
  }
  return 'opens in ${diff.inMinutes} minutes';
}

String initialsOf(String? name) {
  if (name == null || name.trim().isEmpty) return '·';
  final parts = name.trim().split(RegExp(r'\s+')).take(2);
  return parts.map((p) => p[0].toUpperCase()).join();
}

void showError(BuildContext context, Object error, [String? fallback]) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(content: Text(fallback ?? error.toString())),
    );
}

/* -------------------------------------------------------------------------- */
/* surfaces                                                                    */
/* -------------------------------------------------------------------------- */

/// The default card: quiet, recedes.
class Surface extends StatelessWidget {
  const Surface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.onTap,
    this.borderColor,
    this.gradientFrom,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final Color? borderColor;
  final Color? gradientFrom;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          padding: padding,
          decoration: BoxDecoration(
            color: Dusk.c600.withValues(alpha: 0.82),
            gradient: gradientFrom == null
                ? null
                : LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [gradientFrom!, Colors.transparent],
                    stops: const [0, 0.65],
                  ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: borderColor ?? Dusk.c400.withValues(alpha: 0.7),
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Paper: for anything handwritten, and for whatever the screen is really about.
class PaperCard extends StatelessWidget {
  const PaperCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(22),
    this.onTap,
    this.glow = false,
    this.borderColor,
    this.gradientFrom,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final bool glow;
  final Color? borderColor;
  final Color? gradientFrom;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        boxShadow: glow
            ? [
                BoxShadow(
                  color: Ember.c400.withValues(alpha: 0.22),
                  blurRadius: 48,
                  spreadRadius: -12,
                ),
              ]
            : null,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Ink(
            padding: padding,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  gradientFrom ?? Colors.white.withValues(alpha: 0.05),
                  Dusk.c500.withValues(alpha: 0.76),
                ],
                stops: const [0, 0.45],
              ),
              border: Border.all(
                color: borderColor ?? Ember.c600.withValues(alpha: 0.28),
              ),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* text bits                                                                   */
/* -------------------------------------------------------------------------- */

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
        color: color ?? Glow.c600,
        fontSize: 11,
        letterSpacing: 1.6,
      ),
    );
  }
}

class ScreenHeader extends StatelessWidget {
  const ScreenHeader({
    super.key,
    this.eyebrow,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String? eyebrow;
  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow != null) ...[
                  SectionLabel(eyebrow!),
                  const SizedBox(height: 6),
                ],
                Text(title, style: text.headlineMedium),
                if (subtitle != null) ...[
                  const SizedBox(height: 6),
                  Text(subtitle!, style: text.bodyMedium),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 12), trailing!],
        ],
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* states                                                                      */
/* -------------------------------------------------------------------------- */

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label = 'One second…'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(height: 14),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({
    super.key,
    required this.emoji,
    required this.title,
    this.body,
    this.action,
  });

  final String emoji;
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Surface(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 44),
      child: Column(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 40)),
          const SizedBox(height: 12),
          Text(title, style: text.headlineSmall, textAlign: TextAlign.center),
          if (body != null) ...[
            const SizedBox(height: 8),
            Text(body!, style: text.bodyMedium, textAlign: TextAlign.center),
          ],
          if (action != null) ...[const SizedBox(height: 18), action!],
        ],
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* controls                                                                    */
/* -------------------------------------------------------------------------- */

class PillChip extends StatelessWidget {
  const PillChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.accent,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final color = accent ?? Ember.c300;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: selected
              ? color.withValues(alpha: 0.15)
              : Dusk.c500.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? color.withValues(alpha: 0.35) : Colors.transparent,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            color: selected ? color : Glow.c400,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class Avatar extends StatelessWidget {
  const Avatar({super.key, this.name, this.url, this.size = 38});

  final String? name;
  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (url != null && url!.isNotEmpty) {
      return ClipOval(
        child: Image.network(
          url!,
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => _fallback(),
        ),
      );
    }
    return _fallback();
  }

  Widget _fallback() => Container(
    width: size,
    height: size,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: Ember.c400.withValues(alpha: 0.15),
      shape: BoxShape.circle,
    ),
    child: Text(
      initialsOf(name),
      style: TextStyle(
        color: Ember.c300,
        fontSize: size * 0.34,
        fontWeight: FontWeight.w600,
      ),
    ),
  );
}

/// Gentle breathing, used on things that are waiting for you.
class SoftPulse extends StatefulWidget {
  const SoftPulse({super.key, required this.child});

  final Widget child;

  @override
  State<SoftPulse> createState() => _SoftPulseState();
}

class _SoftPulseState extends State<SoftPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: Tween(begin: 1.0, end: 1.045).animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
      ),
      child: FadeTransition(
        opacity: Tween(begin: 1.0, end: 0.86).animate(_controller),
        child: widget.child,
      ),
    );
  }
}

/// The reveal: what a sealed thing does when it opens.
class Unseal extends StatefulWidget {
  const Unseal({super.key, required this.child});

  final Widget child;

  @override
  State<Unseal> createState() => _UnsealState();
}

class _UnsealState extends State<Unseal> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 800),
  )..forward();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curve = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutBack,
    );

    return FadeTransition(
      opacity: CurvedAnimation(parent: _controller, curve: Curves.easeOut),
      child: ScaleTransition(
        scale: Tween(begin: 0.94, end: 1.0).animate(curve),
        child: widget.child,
      ),
    );
  }
}

/// Staggered entrance for list items so screens settle rather than snap.
class Rise extends StatelessWidget {
  const Rise({super.key, required this.child, this.index = 0});

  final Widget child;
  final int index;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 340 + (index.clamp(0, 8) * 45)),
      curve: Curves.easeOutCubic,
      builder: (context, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(offset: Offset(0, 12 * (1 - t)), child: child),
      ),
      child: child,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* sheets                                                                      */
/* -------------------------------------------------------------------------- */

/// Every composer in the app is one of these: full-height-capable, keyboard
/// aware, dismissible.
Future<T?> showComposerSheet<T>({
  required BuildContext context,
  required String title,
  required Widget Function(BuildContext) builder,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Dusk.c700,
    builder: (context) => Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 8,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
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
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 18),
            builder(context),
          ],
        ),
      ),
    ),
  );
}

class SheetField extends StatelessWidget {
  const SheetField({
    super.key,
    required this.label,
    required this.child,
    this.hint,
  });

  final String label;
  final Widget child;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionLabel(label),
          const SizedBox(height: 8),
          child,
          if (hint != null) ...[
            const SizedBox(height: 6),
            Text(hint!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}
