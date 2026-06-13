import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type AlertSeverity = 'warning' | 'critical';

type AlertEvent = {
  source: 'api';
  event: string;
  severity: AlertSeverity;
  message: string;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|database_url|mysql_pwd|openid|password|phone|secret|token|unionid)/i;
const TEXT_REDACTIONS = [
  /\b(?:DATABASE_URL|[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|APP_SECRET))=\S+/gi,
  /\b(?:DATABASE_URL|[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|APP_SECRET))\b/gi,
  /\b(mysql|postgresql|mongodb|redis):\/\/\S+/gi,
  /\b(openid|unionid)=?[A-Za-z0-9_-]+/gi,
  /\b(access_token|refresh_token|token|secret|password)=\S+/gi,
  /\b1[3-9]\d{9}\b/g,
  /(^|\s)(\/Users|\/home|\/var|\/private\/var|[A-Za-z]:\\)[^\s"]+/g,
  /\b(apps|src|dist)\/[A-Za-z0-9._/-]+:\d+:\d+\b/g,
  /\bat\s+[A-Za-z0-9_.<>]+\s+\([^)]+\)/g
];

@Injectable()
export class AlertingService {
  constructor(private readonly config: ConfigService) {}

  async notify(input: AlertEvent): Promise<boolean> {
    const webhookUrl = this.config.get<string>('ALERT_WEBHOOK_URL')?.trim();
    if (!webhookUrl) {
      return false;
    }

    const payload = {
      source: input.source,
      event: input.event,
      severity: input.severity,
      message: redactAlertText(input.message),
      metadata: redactAlertValue(input.metadata ?? {}),
      occurredAt: new Date().toISOString()
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.authHeaders()
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      return true;
    } catch {
      return false;
    }
  }

  private authHeaders(): Record<string, string> {
    const token = this.config.get<string>('ALERT_WEBHOOK_TOKEN')?.trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

export function redactAlertValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactAlertText(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactAlertValue(item));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactAlertValue(item)
    ])
  );
}

export function redactAlertText(value: string) {
  return TEXT_REDACTIONS.reduce((text, pattern) => text.replace(pattern, '[redacted]'), value).slice(0, 500);
}
