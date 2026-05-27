import { createHash } from 'node:crypto';

export function endpointHash(endpoint) {
  return createHash('sha256').update(String(endpoint || '')).digest('hex');
}

export class GuardianPushStore {
  constructor(repository) {
    this.repository = repository;
  }

  async save({ subscription, userAgent, platform, deviceLabel }) {
    return this.repository.saveGuardianPushSubscription({
      endpointHash: endpointHash(subscription.endpoint),
      subscription,
      userAgent: String(userAgent || ''),
      platform: String(platform || ''),
      deviceLabel: String(deviceLabel || 'Guardian device')
    });
  }

  async active() {
    return this.repository.listGuardianPushSubscriptions();
  }

  async success(item) {
    return this.repository.updateGuardianPushSubscription(item.endpointHash, {
      isActive: true,
      lastSuccessAt: new Date().toISOString(),
      lastError: null
    });
  }

  async failure(item, error, inactive = false) {
    return this.repository.updateGuardianPushSubscription(item.endpointHash, {
      isActive: inactive ? false : item.isActive !== false,
      lastError: error.message
    });
  }

  async unsubscribe(endpoint) {
    return this.repository.updateGuardianPushSubscription(endpointHash(endpoint), {
      isActive: false,
      lastError: 'Unsubscribed by user'
    });
  }
}
