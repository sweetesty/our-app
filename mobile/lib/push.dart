import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api.dart';

/// Push notifications.
///
/// The flow end to end:
///   1. this file registers the device's FCM token against the signed-in user
///   2. a nudge is inserted; the trigger in 0007_push.sql posts the event
///   3. the send-push Edge Function looks up the partner's tokens and calls FCM
///   4. the phone wakes up
///
/// Everything here degrades quietly. If Firebase is not configured yet, or the
/// user declines permission, the app keeps working — nudges still arrive over
/// realtime whenever the app is open.
class Push {
  static const _channel = AndroidNotificationChannel(
    'nudges',
    'Nudges',
    description: 'When your person is thinking about you.',
    importance: Importance.high,
  );

  static final _local = FlutterLocalNotificationsPlugin();

  static bool _available = false;
  static String? _registeredToken;

  static bool get isAvailable => _available;

  /// Called once at startup, before runApp.
  static Future<void> init() async {
    try {
      await Firebase.initializeApp();
      _available = true;
    } catch (error) {
      // No google-services.json / GoogleService-Info.plist yet. Not fatal.
      debugPrint('Push disabled — Firebase not configured: $error');
      return;
    }

    // Android shows an incoming notification itself only while the app is
    // backgrounded. In the foreground we draw it, which is what this channel
    // and plugin are for.
    await _local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          // Firebase Messaging asks for permission itself; asking twice would
          // show the system prompt to the user two times.
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
    );

    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    FirebaseMessaging.onMessage.listen(_showForeground);
  }

  /// Ask permission and register the token. Safe to call on every launch and
  /// after every sign-in; the RPC upserts on the token.
  static Future<void> registerForUser() async {
    if (!_available || Api.userId == null) return;

    try {
      final messaging = FirebaseMessaging.instance;

      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('Push permission declined.');
        return;
      }

      // On iOS the APNs token can lag behind app start; without it getToken()
      // returns null and the registration silently does nothing.
      if (Platform.isIOS) {
        final apns = await messaging.getAPNSToken();
        if (apns == null) {
          await Future<void>.delayed(const Duration(seconds: 2));
        }
      }

      final token = await messaging.getToken();
      if (token == null) return;

      await _register(token);

      // FCM rotates tokens; a stale one means silent failure until reinstall.
      messaging.onTokenRefresh.listen(_register);
    } catch (error) {
      debugPrint('Push registration failed: $error');
    }
  }

  static Future<void> _register(String token) async {
    if (token == _registeredToken) return;
    try {
      await Api.registerDeviceToken(
        token,
        Platform.isIOS ? 'ios' : 'android',
      );
      _registeredToken = token;
    } catch (error) {
      debugPrint('Could not store device token: $error');
    }
  }

  /// On sign-out, so a shared phone stops receiving the other person's nudges.
  static Future<void> unregister() async {
    final token = _registeredToken;
    if (token == null) return;
    try {
      await Api.unregisterDeviceToken(token);
    } catch (_) {
      // Signing out matters more than tidying up.
    }
    _registeredToken = null;
  }

  static Future<void> _showForeground(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    await _local.show(
      id: notification.hashCode,
      title: notification.title,
      body: notification.body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
    );
  }
}
