import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Same room as the web app: deep ink-plum walls, one candle. The tokens here
/// mirror web/src/index.css one-for-one so the two clients feel like the same
/// place rather than two apps that happen to share a database.
/// Named Dusk rather than Ink so it does not shadow Flutter's `Ink` widget,
/// which the card surfaces in widgets.dart rely on.
class Dusk {
  static const c900 = Color(0xFF14101B);
  static const c800 = Color(0xFF17111F);
  static const c700 = Color(0xFF1F1829);
  static const c600 = Color(0xFF251D31);
  static const c500 = Color(0xFF2E2540);
  static const c400 = Color(0xFF3A2E4E);
}

class Glow {
  static const c100 = Color(0xFFF4EEFA);
  static const c200 = Color(0xFFE0D4EC);
  static const c400 = Color(0xFFB4A6C4);
  static const c600 = Color(0xFF7E7090);
}

class Ember {
  static const c300 = Color(0xFFF2D49B);
  static const c400 = Color(0xFFE8B961);
  static const c500 = Color(0xFFD99F3F);
  static const c600 = Color(0xFFA8752A);
}

class Accent {
  static const rose = Color(0xFFD97A93);
  static const sage = Color(0xFF6FA89C);
  static const violet = Color(0xFF8B7BC7);
  static const flame = Color(0xFFD65A5A);
}

TextTheme _textTheme() {
  final display = GoogleFonts.frauncesTextTheme();
  final body = GoogleFonts.interTextTheme();

  return TextTheme(
    displayLarge: display.displayLarge?.copyWith(color: Glow.c100),
    displayMedium: display.displayMedium?.copyWith(color: Glow.c100),
    headlineLarge: display.headlineLarge?.copyWith(
      color: Glow.c100,
      fontWeight: FontWeight.w400,
      letterSpacing: -0.5,
    ),
    headlineMedium: display.headlineMedium?.copyWith(
      color: Glow.c100,
      fontWeight: FontWeight.w400,
      letterSpacing: -0.4,
    ),
    headlineSmall: display.headlineSmall?.copyWith(
      color: Glow.c100,
      fontWeight: FontWeight.w400,
    ),
    titleLarge: display.titleLarge?.copyWith(color: Glow.c100),
    titleMedium: body.titleMedium?.copyWith(color: Glow.c200),
    bodyLarge: body.bodyLarge?.copyWith(color: Glow.c100, height: 1.55),
    bodyMedium: body.bodyMedium?.copyWith(color: Glow.c400, height: 1.5),
    bodySmall: body.bodySmall?.copyWith(color: Glow.c600, height: 1.45),
    labelLarge: body.labelLarge?.copyWith(color: Glow.c100),
    labelSmall: body.labelSmall?.copyWith(
      color: Glow.c600,
      letterSpacing: 1.6,
      fontWeight: FontWeight.w600,
    ),
  );
}

ThemeData buildTheme() {
  final text = _textTheme();

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: Dusk.c800,
    canvasColor: Dusk.c800,
    textTheme: text,
    colorScheme: const ColorScheme.dark(
      primary: Ember.c400,
      onPrimary: Dusk.c900,
      secondary: Accent.rose,
      surface: Dusk.c600,
      onSurface: Glow.c100,
      error: Accent.flame,
    ),
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: text.headlineSmall,
      iconTheme: const IconThemeData(color: Glow.c400),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Ember.c400,
        foregroundColor: Dusk.c900,
        textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        shape: const StadiumBorder(),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Glow.c100,
        side: const BorderSide(color: Dusk.c400),
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 15),
        shape: const StadiumBorder(),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: Ember.c300),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Dusk.c700.withValues(alpha: 0.7),
      hintStyle: text.bodyMedium?.copyWith(color: Glow.c600),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      border: _border(Dusk.c400),
      enabledBorder: _border(Dusk.c400),
      focusedBorder: _border(Ember.c500.withValues(alpha: 0.6)),
      errorBorder: _border(Accent.flame.withValues(alpha: 0.6)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Dusk.c600,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Dusk.c700,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: Dusk.c500,
      contentTextStyle: text.bodyMedium?.copyWith(color: Glow.c100),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    dividerTheme: const DividerThemeData(color: Dusk.c500, thickness: 1),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Ember.c400),
  );
}

OutlineInputBorder _border(Color color) => OutlineInputBorder(
  borderRadius: BorderRadius.circular(18),
  borderSide: BorderSide(color: color),
);

/// The two low candles behind everything, matching the web body gradient.
class CandleBackground extends StatelessWidget {
  const CandleBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: Dusk.c800,
        gradient: RadialGradient(
          center: Alignment(-0.75, -1.1),
          radius: 1.5,
          colors: [Color(0x1AE8B961), Color(0x0017111F)],
          stops: [0.0, 0.62],
        ),
      ),
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0.85, -0.85),
            radius: 1.3,
            colors: [Color(0x1A8B7BC7), Color(0x0017111F)],
            stops: [0.0, 0.6],
          ),
        ),
        child: child,
      ),
    );
  }
}
